"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatNumber, formatPrice, cn } from "@/lib/format";
import type { Listing } from "@/lib/types";

export function listingStatus(listing: Listing) {
  if (listing.status === "in_contract") return "Pending";
  if (listing.status === "closed") return "Sold";
  return "For Sale";
}

export function PropertyCard({
  listing,
  selected,
  saved,
  onSave,
  onHighlight,
  monthlyEstimate,
  withinBuyingPower,
  linked = true,
}: {
  listing: Listing;
  selected?: boolean;
  saved?: boolean;
  onSave?: (id: string) => void;
  onHighlight?: (id: string | null) => void;
  monthlyEstimate?: number;
  withinBuyingPower?: boolean;
  /** When false, the card is display-only (no listing detail links). */
  linked?: boolean;
}) {
  const sold = listing.status === "closed";
  const labels = sold ? ["Sold"] : listing.badge ? [listing.badge] : [];
  const photos = sold ? listing.photos.slice(0, 1) : listing.photos.filter(Boolean);
  const [photoIndex, setPhotoIndex] = useState(0);
  const current = photos[photoIndex] ?? photos[0];
  const canCycle = photos.length > 1;

  function stepPhoto(delta: number, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setPhotoIndex((i) => (i + delta + photos.length) % photos.length);
  }

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-xl border bg-white shadow-sm ring-2 transition-[border-color,box-shadow]",
        selected ? "border-forest ring-forest" : "border-line ring-transparent",
      )}
      onMouseEnter={() => onHighlight?.(listing.id)}
      onMouseLeave={() => onHighlight?.(null)}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-sand">
        {linked ? (
          <Link href={`/listing/${listing.id}`} className="absolute inset-0 block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current}
              alt={listing.title}
              className="h-full w-full object-cover"
            />
          </Link>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current}
            alt={listing.title}
            className="h-full w-full object-cover"
          />
        )}
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap gap-1">
          {labels.map((l) => (
            <Badge
              key={l}
              tone={
                l === "Sold"
                  ? "sold"
                  : l === "Price Cut"
                    ? "dark"
                    : l === "New Listing"
                      ? "lime"
                      : "neutral"
              }
            >
              {l}
            </Badge>
          ))}
        </div>
        {canCycle ? (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(event) => stepPhoto(-1, event)}
              className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-cream/50 text-forest shadow-sm transition hover:bg-cream"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={(event) => stepPhoto(1, event)}
              className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-cream/50 text-forest shadow-sm transition hover:bg-cream"
            >
              <ChevronRight size={18} />
            </button>
          </>
        ) : null}
      </div>
      <div className="relative p-3">
        {onSave ? (
          <button
            className="absolute right-2 top-2 rounded-full p-1.5 hover:bg-warm"
            aria-label="Save home"
            onClick={() => onSave(listing.id)}
          >
            <Heart
              size={18}
              className={saved ? "fill-forest text-forest" : "text-forest"}
            />
          </button>
        ) : null}
        <div className={cn("block", onSave && "pr-8")}>
          {linked ? (
            <Link href={`/listing/${listing.id}`} className="block">
              <PropertyCardCopy
                listing={listing}
                monthlyEstimate={monthlyEstimate}
                withinBuyingPower={withinBuyingPower}
              />
            </Link>
          ) : (
            <PropertyCardCopy
              listing={listing}
              monthlyEstimate={monthlyEstimate}
              withinBuyingPower={withinBuyingPower}
            />
          )}
        </div>
      </div>
    </article>
  );
}

function PropertyCardCopy({
  listing,
  monthlyEstimate,
  withinBuyingPower,
}: {
  listing: Listing;
  monthlyEstimate?: number;
  withinBuyingPower?: boolean;
}) {
  return (
    <>
      <p className="text-lg font-semibold tracking-tight">
        {formatPrice(listing.price)}
      </p>
      {monthlyEstimate != null ? (
        <p className="mt-0.5 text-[13px] text-forest/75">
          Est. {formatPrice(Math.round(monthlyEstimate))}/mo
        </p>
      ) : null}
      {withinBuyingPower ? (
        <div className="mt-1.5">
          <Badge tone="lime">Within your buying power</Badge>
        </div>
      ) : null}
      <p className="mt-0.5 text-[13px] text-forest/80">
        <strong>{listing.beds}</strong> bds · <strong>{listing.baths}</strong> ba ·{" "}
        <strong>{formatNumber(listing.sqft)}</strong> sqft
        <span className="text-muted"> — {listingStatus(listing)}</span>
      </p>
      <p className="mt-1 truncate text-[13px] text-muted">
        {listing.address}, {listing.city}, {listing.state}
        {listing.zip ? ` ${listing.zip}` : ""}
      </p>
    </>
  );
}
