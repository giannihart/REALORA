"use client";

import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { listingCoordinate, NYC_REGION } from "@/lib/nyc/map-bounds";
import { formatMapPinLabel } from "@/lib/format";
import { loadMapKit, MapKitConfigError } from "@/lib/mapkit/load";
import type { Listing } from "@/lib/types";

export type AppleMapHandle = {
  zoomBy: (factor: number) => void;
};

type PinListing = Pick<Listing, "id" | "title" | "price" | "pin" | "lat" | "lng" | "neighborhood" | "status">;

export function AppleMap({
  listings,
  highlightedId,
  onHighlight,
  onOpen,
  className,
  style,
  single,
  mapRef,
}: {
  listings: PinListing[];
  highlightedId?: string | null;
  onHighlight?: (id: string | null) => void;
  onOpen?: (id: string) => void;
  className?: string;
  style?: CSSProperties;
  single?: boolean;
  mapRef?: MutableRefObject<AppleMapHandle | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<mapkit.Map | null>(null);
  const annotations = useRef<Map<string, mapkit.Annotation>>(new Map());
  const listingsRef = useRef(listings);
  const highlightRef = useRef(highlightedId);
  const onHighlightRef = useRef(onHighlight);
  const onOpenRef = useRef(onOpen);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  listingsRef.current = listings;
  highlightRef.current = highlightedId;
  onHighlightRef.current = onHighlight;
  onOpenRef.current = onOpen;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

    loadMapKit()
      .then((kit) => {
        if (cancelled || !hostRef.current) return;
        const map = new kit.Map(host, {
          mapType: kit.Map.MapTypes.Standard,
          colorScheme: kit.Map.ColorSchemes.Light,
          isRotationEnabled: false,
          showsMapTypeControl: false,
          showsZoomControl: false,
          showsCompass: kit.FeatureVisibility.Hidden,
          showsScale: kit.FeatureVisibility.Hidden,
          showsPointsOfInterest: true,
          padding: new kit.Padding(24, 24, 48, 24),
          region: new kit.CoordinateRegion(
            new kit.Coordinate(NYC_REGION.center.lat, NYC_REGION.center.lng),
            new kit.CoordinateSpan(NYC_REGION.span.lat, NYC_REGION.span.lng),
          ),
        });
        mapObj.current = map;
        if (mapRef) {
          mapRef.current = {
            zoomBy: (factor) => {
              const region = map.region;
              const nextLat = Math.min(0.35, Math.max(0.004, region.span.latitudeDelta * factor));
              const nextLng = Math.min(0.5, Math.max(0.005, region.span.longitudeDelta * factor));
              map.setRegionAnimated(
                new kit.CoordinateRegion(region.center, new kit.CoordinateSpan(nextLat, nextLng)),
              );
            },
          };
        }
        syncAnnotations(kit, map, listingsRef.current, highlightRef.current, single);
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus(error instanceof MapKitConfigError ? "missing" : "error");
      });

    return () => {
      cancelled = true;
      if (mapRef) mapRef.current = null;
      const map = mapObj.current;
      mapObj.current = null;
      annotations.current.clear();
      map?.destroy();
    };
  }, [mapRef, single]);

  const listingKey = listings.map((row) => row.id).join("|");

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !window.mapkit || status !== "ready") return;
    syncAnnotations(window.mapkit, map, listingsRef.current, highlightRef.current, single);
  }, [listingKey, single, status]);

  useEffect(() => {
    annotations.current.forEach((annotation, id) => {
      const el = annotation.element;
      if (el) el.classList.toggle("is-active", id === highlightedId);
      annotation.selected = id === highlightedId;
    });
  }, [highlightedId]);

  function syncAnnotations(
    kit: typeof mapkit,
    map: mapkit.Map,
    rows: PinListing[],
    activeId: string | null | undefined,
    tight?: boolean,
  ) {
    const nextIds = new Set(rows.map((row) => row.id));
    annotations.current.forEach((annotation, id) => {
      if (nextIds.has(id)) return;
      map.removeAnnotation(annotation);
      annotations.current.delete(id);
    });

    const created: mapkit.Annotation[] = [];
    for (const listing of rows) {
      if (annotations.current.has(listing.id)) continue;
      const coord = listingCoordinate(listing);
      const annotation = new kit.Annotation(
        new kit.Coordinate(coord.lat, coord.lng),
        (_coordinate, options) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className =
            listing.status === "closed" ? "realora-map-pin is-sold" : "realora-map-pin";
          button.textContent = options.title ?? "";
          button.setAttribute("aria-label", listing.title);
          button.addEventListener("mouseenter", () => onHighlightRef.current?.(listing.id));
          button.addEventListener("mouseleave", () => onHighlightRef.current?.(null));
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenRef.current?.(listing.id);
          });
          return button;
        },
        {
          title: formatMapPinLabel(listing.price, listing.status === "closed"),
          data: { id: listing.id },
          calloutEnabled: false,
          animates: false,
          displayPriority: 1000,
        },
      );
      annotation.addEventListener("select", () => onHighlightRef.current?.(listing.id));
      map.addAnnotation(annotation);
      annotations.current.set(listing.id, annotation);
      created.push(annotation);
    }

    annotations.current.forEach((annotation, id) => {
      const el = annotation.element;
      if (el) el.classList.toggle("is-active", id === activeId);
    });

    const all = [...annotations.current.values()];
    if (!all.length) return;
    const padding = new kit.Padding(48, 36, 72, 36);
    if (tight || all.length === 1) {
      const listing = rows[0];
      const coord = listingCoordinate(listing);
      map.setRegionAnimated(
        new kit.CoordinateRegion(
          new kit.Coordinate(coord.lat, coord.lng),
          new kit.CoordinateSpan(0.018, 0.024),
        ),
        false,
      );
      return;
    }
    if (created.length || all.length === rows.length) {
      map.showItems(all, {
        animate: false,
        padding,
        minimumSpan: new kit.CoordinateSpan(0.03, 0.04),
      });
    }
  }

  return (
    <div className={className} style={style}>
      <div ref={hostRef} className="apple-map-root absolute inset-0" />
      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 bg-[#F3EEE8]" />
      ) : null}
      {status === "missing" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F3EEE8] px-8 text-center">
          <p className="max-w-sm text-sm text-muted">
            Apple Maps needs a Maps identifier. Add <span className="text-forest">MAPKIT_TEAM_ID</span>,{" "}
            <span className="text-forest">MAPKIT_KEY_ID</span>, and{" "}
            <span className="text-forest">MAPKIT_PRIVATE_KEY</span> to <span className="text-forest">.env.local</span>.
          </p>
        </div>
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F3EEE8] px-8 text-center">
          <p className="max-w-sm text-sm text-muted">Apple Maps could not load. Check the MapKit token and origin.</p>
        </div>
      ) : null}
    </div>
  );
}
