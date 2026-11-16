"use client";

import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { NYC_REGION } from "@/lib/nyc/map-bounds";
import { formatMapPinLabel } from "@/lib/format";
import { loadGoogleMaps, MapsConfigError } from "@/lib/google-maps/load";
import { REALORA_MAP_STYLES } from "@/lib/google-maps/styles";
import { geocodeListing, type MappableListing } from "@/lib/google-maps/geocode";
import {
  extendBoundsFromGeometry,
  FOREST_MAP,
  type PlaceBoundary,
} from "@/lib/geo/polygon";
import type { Listing } from "@/lib/types";

export type GoogleMapHandle = {
  zoomBy: (delta: number) => void;
};

type PinListing = Pick<
  Listing,
  | "id"
  | "title"
  | "price"
  | "pin"
  | "lat"
  | "lng"
  | "neighborhood"
  | "address"
  | "borough"
  | "city"
  | "state"
  | "zip"
  | "status"
>;

type PinOverlay = google.maps.OverlayView & {
  listingId: string;
  setActive: (on: boolean) => void;
  setSold: (on: boolean) => void;
  setPosition: (position: google.maps.LatLngLiteral) => void;
};

function createPinOverlayClass(maps: typeof google.maps) {
  return class PinOverlay extends maps.OverlayView {
    listingId: string;
    private listing: PinListing;
    private position: google.maps.LatLngLiteral;
    private el: HTMLButtonElement | null = null;
    private active = false;
    private sold = false;
    private onHighlight?: (id: string | null) => void;
    private onOpen?: (id: string) => void;

    constructor(
      listing: PinListing,
      position: google.maps.LatLngLiteral,
      handlers: { onHighlight?: (id: string | null) => void; onOpen?: (id: string) => void },
    ) {
      super();
      this.listing = listing;
      this.listingId = listing.id;
      this.position = position;
      this.sold = listing.status === "closed";
      this.onHighlight = handlers.onHighlight;
      this.onOpen = handlers.onOpen;
    }

    onAdd() {
      const button = document.createElement("button");
      button.type = "button";
      const label = formatMapPinLabel(this.listing.price, this.sold);
      button.className = this.sold ? "realora-map-pin is-sold" : "realora-map-pin";
      button.textContent = label;
      button.setAttribute("aria-label", `${this.listing.title} · ${label}`);
      maps.OverlayView.preventMapHitsAndGesturesFrom(button);
      button.addEventListener("mouseenter", () => this.onHighlight?.(this.listing.id));
      button.addEventListener("mouseleave", () => this.onHighlight?.(null));
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.onOpen?.(this.listing.id);
      });
      this.el = button;
      button.classList.toggle("is-active", this.active);
      this.getPanes()?.overlayMouseTarget.appendChild(button);
    }

    draw() {
      const point = this.getProjection()?.fromLatLngToDivPixel(this.position);
      if (!point || !this.el) return;
      this.el.style.left = `${point.x}px`;
      this.el.style.top = `${point.y}px`;
    }

    onRemove() {
      this.el?.remove();
      this.el = null;
    }

    setActive(on: boolean) {
      this.active = on;
      this.el?.classList.toggle("is-active", on);
    }

    setSold(on: boolean) {
      this.sold = on;
      this.el?.classList.toggle("is-sold", on);
      if (this.el) {
        const label = formatMapPinLabel(this.listing.price, on);
        this.el.textContent = label;
        this.el.setAttribute("aria-label", `${this.listing.title} · ${label}`);
      }
    }

    setPosition(position: google.maps.LatLngLiteral) {
      this.position = position;
      this.draw();
    }
  };
}

export function GoogleMap({
  listings,
  highlightedId,
  onHighlight,
  onOpen,
  className,
  style,
  single,
  mapRef,
  boundary,
}: {
  listings: PinListing[];
  highlightedId?: string | null;
  onHighlight?: (id: string | null) => void;
  onOpen?: (id: string) => void;
  className?: string;
  style?: CSSProperties;
  single?: boolean;
  mapRef?: MutableRefObject<GoogleMapHandle | null>;
  boundary?: PlaceBoundary | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<google.maps.Map | null>(null);
  const overlays = useRef<Map<string, PinOverlay>>(new Map());
  const OverlayClass = useRef<ReturnType<typeof createPinOverlayClass> | null>(null);
  const listingsRef = useRef(listings);
  const onHighlightRef = useRef(onHighlight);
  const onOpenRef = useRef(onOpen);
  const hasBoundaryRef = useRef(Boolean(boundary));
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  listingsRef.current = listings;
  onHighlightRef.current = onHighlight;
  onOpenRef.current = onOpen;
  hasBoundaryRef.current = Boolean(boundary);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !hostRef.current) return;
        const map = new maps.Map(hostRef.current, {
          center: NYC_REGION.center,
          zoom: single ? 16 : 13,
          minZoom: 11,
          maxZoom: 20,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          styles: REALORA_MAP_STYLES,
        });
        mapObj.current = map;
        OverlayClass.current = createPinOverlayClass(maps);
        if (mapRef) {
          mapRef.current = {
            zoomBy: (delta) => {
              const current = map.getZoom() ?? 13;
              map.setZoom(Math.min(20, Math.max(11, current + delta)));
            },
          };
        }
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus(error instanceof MapsConfigError ? "missing" : "error");
      });

    return () => {
      cancelled = true;
      if (mapRef) mapRef.current = null;
      overlays.current.forEach((overlay) => overlay.setMap(null));
      overlays.current.clear();
      mapObj.current = null;
    };
  }, [mapRef, single]);

  const listingKey = listings
    .map((row) => `${row.id}:${row.address}:${row.zip}:${row.status}`)
    .join("|");

  useEffect(() => {
    if (status !== "ready") return;
    const map = mapObj.current;
    const PinOverlay = OverlayClass.current;
    const maps = window.google?.maps;
    if (!map || !PinOverlay || !maps) return;
    let cancelled = false;

    const rows = listingsRef.current;
    const nextIds = new Set(rows.map((row) => row.id));
    overlays.current.forEach((overlay, id) => {
      if (nextIds.has(id)) return;
      overlay.setMap(null);
      overlays.current.delete(id);
    });

    void Promise.all(
      rows.map(async (listing) => {
        const coord = await geocodeListing(maps, listing as MappableListing);
        return { listing, coord };
      }),
    ).then((placed) => {
      if (cancelled || !mapObj.current) return;
      const bounds = new maps.LatLngBounds();
      let count = 0;
      for (const { listing, coord } of placed) {
        if (!coord) continue;
        count += 1;
        bounds.extend(coord);
        const existing = overlays.current.get(listing.id);
        if (existing) {
          existing.setPosition(coord);
          existing.setSold(listing.status === "closed");
          existing.setActive(listing.id === highlightedId);
          continue;
        }
        const overlay = new PinOverlay(listing, coord, {
          onHighlight: (id) => onHighlightRef.current?.(id),
          onOpen: (id) => onOpenRef.current?.(id),
        }) as PinOverlay;
        overlay.setMap(map);
        overlay.setActive(listing.id === highlightedId);
        overlays.current.set(listing.id, overlay);
      }
      if (!count || hasBoundaryRef.current) return;
      if (single || count === 1) {
        const first = placed.find((row) => row.coord)?.coord;
        if (first) {
          map.panTo(first);
          map.setZoom(17);
        }
        return;
      }
      map.fitBounds(bounds, { top: 56, right: 40, bottom: 72, left: 40 });
    });

    return () => {
      cancelled = true;
    };
    // highlightedId is applied separately so geocoding is not re-run on hover
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingKey, single, status]);

  useEffect(() => {
    overlays.current.forEach((overlay, id) => overlay.setActive(id === highlightedId));
  }, [highlightedId]);

  useEffect(() => {
    if (status !== "ready") return;
    const map = mapObj.current;
    const maps = window.google?.maps;
    if (!map?.data || !maps) return;

    map.data.forEach((feature) => map.data.remove(feature));
    if (!boundary) return;

    map.data.addGeoJson({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: boundary.geometry, properties: { name: boundary.name } }],
    });
    map.data.setStyle({
      fillColor: FOREST_MAP,
      fillOpacity: 0.1,
      strokeColor: FOREST_MAP,
      strokeOpacity: 1,
      strokeWeight: 3,
      clickable: false,
    });
    const bounds = new maps.LatLngBounds();
    extendBoundsFromGeometry((point) => bounds.extend(point), boundary.geometry);
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { top: 72, right: 48, bottom: 72, left: 40 });
    }
  }, [boundary, status]);

  return (
    <div className={className} style={style}>
      <div ref={hostRef} className="google-map-root absolute inset-0" />
      {status === "loading" ? <div className="pointer-events-none absolute inset-0 bg-[#e5e3df]" /> : null}
      {status === "missing" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#e5e3df] px-8 text-center">
          <p className="max-w-sm text-sm text-muted">
            Google Maps needs an API key. Add <span className="text-forest">GOOGLE_MAPS_API_KEY</span> to{" "}
            <span className="text-forest">.env.local</span> and enable the Maps JavaScript API.
          </p>
        </div>
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#e5e3df] px-8 text-center">
          <p className="max-w-sm text-sm text-muted">
            Google Maps could not load. Check the API key, referrer restrictions, and that Maps JavaScript API is
            enabled.
          </p>
        </div>
      ) : null}
    </div>
  );
}
