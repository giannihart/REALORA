"use client";

import Image from "next/image";
import { Minus, Plus } from "lucide-react";
import { ListingCard } from "@/components/public/ListingCard";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MapView({
  listings,
  selectedId,
  savedIds,
  onSelect,
  onSave,
}: {
  listings: Listing[];
  selectedId: string | null;
  savedIds: string[];
  onSelect: (id: string) => void;
  onSave: (id: string) => void;
}) {
  const selected = listings.find((l) => l.id === selectedId) ?? listings[0];

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-[24px] bg-sand">
      <Image
        src="/map/manhattan.webp"
        alt="Map of Manhattan listings"
        fill
        className="realora-map-image object-cover object-[0%_28%]"
        sizes="(max-width: 1024px) 100vw, 48vw"
        priority
        unoptimized
      />
      <div className="shadow-card absolute top-4 right-4 flex flex-col overflow-hidden rounded-[14px] border border-line bg-white">
        <button type="button" aria-label="Zoom in" className="ctrl grid h-11 w-11 place-items-center border-b border-line">
          <Plus className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        <button type="button" aria-label="Zoom out" className="ctrl grid h-11 w-11 place-items-center">
          <Minus className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
      </div>
      {listings.map((listing) => {
        const active = listing.id === selected?.id;
        return (
          <button
            key={listing.id}
            type="button"
            onClick={() => onSelect(listing.id)}
            style={{ left: `${listing.pin.x}%`, top: `${listing.pin.y}%` }}
            className={cn(
              "ctrl nums absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-[13px] font-semibold",
              active
                ? "scale-[1.06] bg-forest-deep text-lime shadow-raised"
                : "map-pin border border-line bg-white text-forest",
            )}
            aria-label={`${listing.address} ${listing.pinLabel}`}
          >
            {listing.pinLabel}
          </button>
        );
      })}
      {selected ? (
        <div className="absolute bottom-5 left-4 w-[240px]">
          <ListingCard
            listing={selected}
            saved={savedIds.includes(selected.id)}
            selected
            onSave={onSave}
          />
        </div>
      ) : null}
      <p className="absolute right-4 bottom-4 text-[11px] text-muted">
        Manhattan · Realora
      </p>
    </div>
  );
}
