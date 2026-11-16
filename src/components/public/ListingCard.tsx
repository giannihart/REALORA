"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { StatusPill } from "@/components/shared/StatusPill";
import { PHOTO_BLUR } from "@/lib/media";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ListingCard({
  listing,
  saved,
  selected,
  onHover,
  onSave,
  priority = false,
}: {
  listing: Listing;
  saved: boolean;
  selected?: boolean;
  onHover?: (id: string | null) => void;
  onSave: (id: string) => void;
  priority?: boolean;
}) {
  const baths = listing.baths % 1 === 0 ? String(listing.baths) : listing.baths.toFixed(1);
  return (
    <article
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        "card-clickable overflow-hidden rounded-[20px] border bg-white shadow-card",
        selected ? "border-lime ring-2 ring-lime" : "border-line",
      )}
    >
      <Link href={`/listing/${listing.id}`} className="photo-grade relative block aspect-[4/3]">
        <Image
          src={listing.photos[0]}
          alt={`${listing.address} in ${listing.neighborhood}`}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 40vw, 320px"
          priority={priority}
          placeholder="blur"
          blurDataURL={PHOTO_BLUR}
          style={{ objectPosition: listing.objectPosition ?? "50% 50%" }}
        />
        {listing.badge ? (
          <span className="absolute top-3 left-3 z-[2]">
            <StatusPill label={listing.badge} />
          </span>
        ) : null}
      </Link>
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/listing/${listing.id}`} className="min-w-0">
            <p className="nums text-xl font-medium tracking-tight tabular-nums">
              {formatMoney(listing.price)}
            </p>
            <p className="mt-1 text-[13px] text-forest">
              {listing.beds} bds · {baths} ba · {formatNumber(listing.sqft)} sqft — For Sale
            </p>
            <p className="mt-1 truncate text-[13px] text-muted">
              {listing.address}, {listing.neighborhood}, New York, NY
            </p>
          </Link>
          <button
            type="button"
            aria-label={saved ? "Remove from saved" : "Save listing"}
            onClick={() => onSave(listing.id)}
            className="ctrl heart-pop mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full"
          >
            <Heart
              className={cn("h-5 w-5", saved && "fill-forest")}
              strokeWidth={1.75}
            />
          </button>
        </div>
      </div>
    </article>
  );
}
