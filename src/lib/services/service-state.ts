import type {
  Booking,
  ConciergeCategory,
  Deal,
  DealState,
  ServiceVendor,
  VendorCategory,
} from "@/lib/types";

export type ServicePhase = "none" | "chosen" | "scheduled" | "completed";

export type ServiceSnapshot = {
  phase: ServicePhase;
  vendorId: string | null;
  isOwn: boolean;
  own?: {
    name: string;
    contact: string;
    note?: string;
    quotedPrice?: number;
  } | null;
  date?: string;
  time?: string;
  outcome?: string;
};

const OWN_PREFIX = "own:";

export function ownVendorId(category: VendorCategory) {
  return `${OWN_PREFIX}${category}`;
}

export function isOwnVendorId(id: string) {
  return id.startsWith(OWN_PREFIX);
}

function bookingForCategory(
  category: VendorCategory,
  bookings: Booking[],
  vendors: ServiceVendor[],
  deal: Deal,
): Booking | undefined {
  const ownId = ownVendorId(category);
  const panelIds = new Set(vendors.filter((v) => v.category === category).map((v) => v.id));
  return bookings.find((b) => {
    if (b.vendorId === ownId) return true;
    if (category === "Inspector" && b.vendorId === "own-inspector") return true;
    return panelIds.has(b.vendorId);
  }) ?? (category === "Inspector" && deal.ownInspector
    ? bookings.find((b) => b.vendorId === "own-inspector")
    : undefined);
}

export function serviceSnapshot(
  category: VendorCategory,
  deal: Deal,
  bookings: Booking[],
  vendors: ServiceVendor[],
): ServiceSnapshot {
  const selection = deal.serviceSelections?.[category];
  const own =
    deal.ownProviders?.[category] ??
    (category === "Inspector" ? deal.ownInspector : null) ??
    null;
  const booking = bookingForCategory(category, bookings, vendors, deal);

  // Completed signals from existing deal/task records.
  if (category === "Inspector" && deal.inspectionReportReviewed) {
    const filedAt = booking?.createdAt ?? booking?.date;
    let outcome = "Report filed";
    if (filedAt) {
      try {
        const d = new Date(filedAt.includes("T") ? filedAt : `${filedAt}T12:00:00`);
        outcome = `Report filed · ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      } catch {
        outcome = "Report filed";
      }
    }
    return {
      phase: "completed",
      vendorId: booking?.vendorId ?? selection ?? (own ? ownVendorId(category) : null),
      isOwn: Boolean(own) || isOwnVendorId(booking?.vendorId ?? ""),
      own,
      date: booking?.date,
      time: booking?.time,
      outcome,
    };
  }
  const completed = deal.serviceCompleted?.[category];
  if (completed) {
    return {
      phase: "completed",
      vendorId: booking?.vendorId ?? selection ?? (own ? ownVendorId(category) : null),
      isOwn: Boolean(own) || isOwnVendorId(booking?.vendorId ?? selection ?? ""),
      own,
      date: booking?.date,
      time: booking?.time,
      outcome: completed.outcome,
    };
  }

  if (booking?.date && booking?.time) {
    return {
      phase: "scheduled",
      vendorId: booking.vendorId,
      isOwn:
        isOwnVendorId(booking.vendorId) ||
        booking.vendorId === "own-inspector" ||
        Boolean(own && (selection === "own" || !selection)),
      own,
      date: booking.date,
      time: booking.time,
    };
  }

  if (selection || own) {
    return {
      phase: "chosen",
      vendorId: selection === "own" || (!selection && own) ? ownVendorId(category) : selection ?? null,
      isOwn: selection === "own" || Boolean(own && selection == null),
      own,
    };
  }

  // Legacy: inspection booked flag without a booking row / time.
  // Spec: Scheduled only once a time exists. Without a selection or timed
  // booking, don't invent a chosen card — stay neutral so Choose still works.
  if (category === "Inspector" && deal.inspectionBooked && (selection || own)) {
    return {
      phase: "chosen",
      vendorId:
        selection === "own" || (!selection && own)
          ? ownVendorId(category)
          : selection ?? null,
      isOwn: selection === "own" || Boolean(own && selection == null),
      own,
    };
  }

  return { phase: "none", vendorId: null, isOwn: false, own: null };
}

/** Consumer-facing when-cues. Photographer / Expediter have no consumer cards. */
export const SERVICE_WHEN: Partial<Record<VendorCategory, string>> &
  Record<"Inspector" | "Movers" | "Cleaners" | "Locksmith", string> = {
  Inspector: "During your deal, when diligence calls for it",
  Movers: "Around closing — and just after",
  Cleaners: "Around closing — and just after",
  Locksmith: "Around closing — and just after",
};

/** Categories that render provider cards on the Services page. */
export const CONSUMER_SERVICES_BY_TIER: Record<
  "assigned" | "curated" | "concierge",
  Array<"Inspector" | "Movers" | "Cleaners" | "Locksmith">
> = {
  assigned: [],
  curated: ["Inspector"],
  concierge: ["Movers", "Cleaners", "Locksmith"],
};

/** @deprecated Use CONSUMER_SERVICES_BY_TIER — assigned media/expediting are not consumer services. */
export const SERVICES_BY_TIER = CONSUMER_SERVICES_BY_TIER;

export type ConsumerServiceCategory = "Inspector" | "Movers" | "Cleaners" | "Locksmith";

export type ServiceTier = "curated" | "concierge";

/** Still needs the user — choose, or (inspector) pick a time. */
export function serviceNeedsDecision(snapshot: ServiceSnapshot): boolean {
  if (snapshot.phase === "none") return true;
  if (snapshot.phase === "chosen") return true;
  return false;
}

/**
 * Services that can surface right now, in priority order.
 * One decision at a time — first needing action wins.
 */
export function servicesDueForState(state: DealState): ConsumerServiceCategory[] {
  if (state === "DILIGENCE") return ["Inspector"];
  if (
    state === "IN_CONTRACT" ||
    state === "CLEAR_TO_CLOSE" ||
    state === "CLOSING"
  ) {
    return ["Movers", "Cleaners"];
  }
  if (state === "POST_CLOSE") return ["Locksmith"];
  return [];
}

export function tierForService(category: ConsumerServiceCategory): ServiceTier {
  return category === "Inspector" ? "curated" : "concierge";
}

export function nextServiceDecision(
  deal: Deal,
  bookings: Booking[],
  vendors: ServiceVendor[],
): { category: ConsumerServiceCategory; tier: ServiceTier; snapshot: ServiceSnapshot } | null {
  const dismissed = new Set(deal.dismissedConcierge ?? []);
  for (const category of servicesDueForState(deal.state)) {
    if (dismissed.has(category as ConciergeCategory)) continue;
    const snapshot = serviceSnapshot(category, deal, bookings, vendors);
    if (!serviceNeedsDecision(snapshot)) continue;
    return { category, tier: tierForService(category), snapshot };
  }
  return null;
}
