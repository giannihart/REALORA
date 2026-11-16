"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PropertyCard } from "@/components/marketplace/PropertyCard";
import { cn } from "@/lib/format";
import type { Listing } from "@/lib/types";

function distanceSq(a: Listing, b: Listing) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
    return Number.POSITIVE_INFINITY;
  }
  const dlat = a.lat - b.lat;
  const dlng = a.lng - b.lng;
  return dlat * dlat + dlng * dlng;
}

function nearbyHomes(current: Listing, listings: Listing[]) {
  return listings
    .filter(
      (row) =>
        row.id !== current.id &&
        row.marketplace &&
        row.status === "live",
    )
    .sort((a, b) => {
      const rank = (row: Listing) =>
        (row.neighborhood === current.neighborhood ? 0 : 1) * 2 +
        (row.borough === current.borough ? 0 : 1);
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      return distanceSq(current, a) - distanceSq(current, b);
    })
    .slice(0, 10);
}

export function NearbyHomes({
  listing,
  listings,
  savedIds,
  onSave,
}: {
  listing: Listing;
  listings: Listing[];
  savedIds: string[];
  onSave: (id: string) => void;
}) {
  const nearby = useMemo(
    () => nearbyHomes(listing, listings),
    [listing, listings],
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: true });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    function update() {
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      setFade({
        left: el.scrollLeft > 4,
        right: max > 4 && el.scrollLeft < max - 4,
      });
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [nearby.length]);

  if (!nearby.length) return null;

  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold tracking-tight text-forest">
        Nearby homes
      </h2>
      <p className="mt-1 text-sm text-muted">
        Other listings near {listing.neighborhood}.
      </p>
      <div className="relative -mx-4 mt-4">
        <div
          ref={scrollerRef}
          className="overflow-x-auto px-4 pb-2"
        >
          <div className="flex snap-x snap-mandatory gap-3">
            {nearby.map((home) => (
              <div
                key={home.id}
                className="w-[17.5rem] shrink-0 snap-start sm:w-[19rem]"
              >
                <PropertyCard
                  listing={home}
                  saved={savedIds.includes(home.id)}
                  onSave={onSave}
                />
              </div>
            ))}
          </div>
        </div>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-cream to-transparent transition-opacity duration-200 sm:w-24",
            fade.left ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-cream to-transparent transition-opacity duration-200 sm:w-24",
            fade.right ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </section>
  );
}
