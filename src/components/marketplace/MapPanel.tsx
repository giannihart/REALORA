"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, X } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { PlaceBoundary } from "@/lib/geo/polygon";
import type { Listing } from "@/lib/types";
import { GoogleMap, type GoogleMapHandle } from "@/components/map/GoogleMap";

export function MapPanel({
  listings,
  highlightedId,
  onHighlight,
  boundary,
  onRemoveBoundary,
}: {
  listings: Listing[];
  highlightedId?: string | null;
  onHighlight?: (id: string | null) => void;
  boundary?: PlaceBoundary | null;
  onRemoveBoundary?: () => void;
}) {
  const router = useRouter();
  const mapRef = useRef<GoogleMapHandle | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const activeId = hoverId ?? highlightedId ?? null;
  const activeListing = listings.find((listing) => listing.id === activeId);

  return (
    <div className="relative h-full overflow-hidden bg-[#e5e3df]">
      <GoogleMap
        listings={listings}
        highlightedId={activeId}
        onHighlight={(id) => {
          setHoverId(id);
          onHighlight?.(id);
        }}
        onOpen={(id) => router.push(`/listing/${id}`)}
        mapRef={mapRef}
        boundary={boundary}
        className="absolute inset-0"
      />

      {boundary && onRemoveBoundary ? (
        <div className="absolute right-4 top-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-line bg-white py-2 pl-3.5 pr-2 text-sm font-medium text-forest shadow-md backdrop-blur-sm">
          Remove Boundary
          <button
            type="button"
            onClick={onRemoveBoundary}
            aria-label="Remove boundary"
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-warm hover:text-forest"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      ) : null}

      <div className="absolute right-4 bottom-4 z-30 flex flex-col overflow-hidden rounded-xl border border-line bg-cream/95 shadow-md backdrop-blur-sm">
        <button
          type="button"
          onClick={() => mapRef.current?.zoomBy(1)}
          aria-label="Zoom in"
          className="flex h-9 w-9 items-center justify-center text-forest transition hover:bg-warm"
        >
          <Plus size={16} strokeWidth={2.25} />
        </button>
        <div className="h-px bg-line" />
        <button
          type="button"
          onClick={() => mapRef.current?.zoomBy(-1)}
          aria-label="Zoom out"
          className="flex h-9 w-9 items-center justify-center text-forest transition hover:bg-warm"
        >
          <Minus size={16} strokeWidth={2.25} />
        </button>
      </div>

      {activeListing ? (
        <button
          type="button"
          onClick={() => router.push(`/listing/${activeListing.id}`)}
          className="absolute bottom-4 left-4 z-20 w-[220px] rounded-xl border border-line bg-cream/95 p-3 text-left shadow-md backdrop-blur-sm transition hover:border-forest"
        >
          <p className="text-sm font-semibold text-forest">
            {activeListing.neighborhood || activeListing.borough}
          </p>
          <p className="mt-1 text-[13px] text-forest/80">
            <strong>{activeListing.beds}</strong> bds · <strong>{activeListing.baths}</strong> ba ·{" "}
            <strong>{formatNumber(activeListing.sqft)}</strong> sqft
          </p>
        </button>
      ) : null}
    </div>
  );
}
