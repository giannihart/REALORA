"use client";

import { ListingCard } from "@/components/public/ListingCard";
import { listings } from "@/data/seed";
import { useAppData } from "@/lib/data/use-app-data";

export function FeaturedListings() {
  const saved = useAppData((s) => s.savedListingIds);
  const toggleSaved = useAppData((s) => s.toggleSaved);
  const featured = listings.filter((l) => l.marketplace).slice(0, 4);

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {featured.map((listing, i) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          saved={saved.includes(listing.id)}
          onSave={toggleSaved}
          priority={i === 0}
        />
      ))}
    </div>
  );
}
