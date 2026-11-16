"use client";

import { useMemo } from "react";
import { vendors as seedVendors } from "@/data/seed";
import { ServiceGroup } from "@/components/portal/services/ServiceGroup";
import { Button } from "@/components/ui/Button";
import { useAppData } from "@/lib/data/use-app-data";
import { isSupabaseDataMode } from "@/lib/data/mode";
import {
  SERVICE_WHEN,
  serviceSnapshot,
} from "@/lib/services/service-state";
import type { ConciergeCategory, ServiceVendor } from "@/lib/types";
import { toast } from "sonner";

const COPY: Record<ConciergeCategory, string> = {
  Movers: "Book the move while you're at it.",
  Cleaners: "Want the place cleaned before you sleep there?",
  Locksmith: "New home, new locks. Worth it.",
};

function shouldOffer(
  category: ConciergeCategory,
  state: string,
): boolean {
  if (category === "Locksmith") {
    return state === "POST_CLOSE";
  }
  return (
    state === "IN_CONTRACT" ||
    state === "CLEAR_TO_CLOSE" ||
    state === "CLOSING"
  );
}

export function ConciergeCard({
  category,
  vendors,
  className,
}: {
  category: ConciergeCategory;
  vendors: ServiceVendor[];
  className?: string;
}) {
  const deal = useAppData((s) => s.deal);
  const bookings = useAppData((s) => s.bookings);
  const bookVendor = useAppData((s) => s.bookVendor);
  const dismissConcierge = useAppData((s) => s.dismissConcierge);
  const selectServiceProvider = useAppData((s) => s.selectServiceProvider);
  const saveOwnProvider = useAppData((s) => s.saveOwnProvider);
  const allVendors = useAppData((s) => s.vendors);
  const panel =
    isSupabaseDataMode() && allVendors?.length ? allVendors : seedVendors;

  const snapshot = serviceSnapshot(category, deal, bookings, panel);

  return (
    <section
      className={`rounded-2xl border border-line bg-white px-5 py-5 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-muted">
            {category}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-forest">{COPY[category]}</h2>
        </div>
        {snapshot.phase === "none" ? (
          <Button
            variant="ghost"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => dismissConcierge(category)}
          >
            Skip
          </Button>
        ) : null}
      </div>
      <ServiceGroup
        category={category}
        when={SERVICE_WHEN[category]}
        vendors={vendors}
        snapshot={snapshot}
        interactive
        setupBlocked={(v) => Boolean(isSupabaseDataMode() && v.setupRequired)}
        onChoose={(vendorId) => {
          selectServiceProvider(category, vendorId);
          toast("Provider chosen.");
        }}
        onSaveOwn={(input) => {
          saveOwnProvider(category, input);
          toast("We'll coordinate with them.");
        }}
        onSchedule={(vendorId, date, time) => {
          void Promise.resolve(bookVendor(vendorId, date, time))
            .then(() => toast(`${category} booked.`))
            .catch((err: unknown) =>
              toast(err instanceof Error ? err.message : "Could not book."),
            );
        }}
      />
    </section>
  );
}

export function ConciergeOffers({ role }: { role: "buyer" | "seller" }) {
  const deal = useAppData((s) => s.deal);
  const bookings = useAppData((s) => s.bookings);
  const liveVendors = useAppData((s) => s.vendors);
  const vendors =
    isSupabaseDataMode() && liveVendors?.length ? liveVendors : seedVendors;

  const dismissed = new Set(deal.dismissedConcierge ?? []);
  const bookedIds = useMemo(
    () => new Set(bookings.map((b) => b.vendorId)),
    [bookings],
  );

  const categories: ConciergeCategory[] =
    role === "buyer"
      ? ["Movers", "Cleaners", "Locksmith"]
      : ["Movers", "Cleaners"];

  const cards = categories
    .filter((cat) => shouldOffer(cat, deal.state))
    .filter((cat) => !dismissed.has(cat))
    .map((cat) => {
      const pool = vendors.filter(
        (v) => v.category === cat && (v.tier === "concierge" || !v.tier),
      );
      const primary = pool[0];
      if (!primary || bookedIds.has(primary.id)) return null;
      if (pool.some((v) => bookedIds.has(v.id))) return null;
      // Hide when this category already has an own/scheduled booking.
      const snap = serviceSnapshot(cat, deal, bookings, vendors);
      if (snap.phase === "scheduled" || snap.phase === "completed") return null;
      return (
        <ConciergeCard key={cat} category={cat} vendors={pool} />
      );
    })
    .filter(Boolean);

  if (!cards.length) return null;
  return <div className="space-y-3">{cards}</div>;
}
