import type {
  FinancingType,
  Listing,
  Offer,
  OfferStatus,
  OfferVerificationTier,
} from "@/lib/types";
import { formatMoney } from "@/lib/format";

export type OfferSort = "rank" | "price" | "net" | "close";

export type NetBreakdown = {
  price: number;
  realoraFee: number;
  buyerAgentFee: number;
  concessions: number;
  net: number;
  agentAttached: boolean;
  coBrokeOn: boolean;
};

const TIER_STRENGTH: Record<OfferVerificationTier, number> = {
  cash_funds_verified: 4,
  fully_underwritten: 3,
  preapproved_docs_verified: 2,
  self_reported: 1,
};

export const VERIFICATION_BADGE: Record<OfferVerificationTier, string> = {
  cash_funds_verified: "Cash — funds verified",
  fully_underwritten: "Fully underwritten",
  preapproved_docs_verified: "Pre-approved — documents verified",
  self_reported: "Self-reported",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function parseDay(iso: string): Date | null {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** "Tue, Nov 24" — never an ISO string. */
export function formatOfferDate(iso: string): string {
  const d = parseDay(iso);
  if (!d) return "—";
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatCloseLine(iso: string, now = startOfToday()): string {
  const d = parseDay(iso);
  if (!d) return "Close date TBD";
  const n = daysBetween(now, d);
  if (n === 0) return `Closes ${formatOfferDate(iso)} (today)`;
  if (n === 1) return `Closes ${formatOfferDate(iso)} (in 1 day)`;
  if (n > 1) return `Closes ${formatOfferDate(iso)} (in ${n} days)`;
  return `Closes ${formatOfferDate(iso)} (${Math.abs(n)} days ago)`;
}

export function formatExpiryRelative(iso: string, now = startOfToday()): string {
  const d = parseDay(iso);
  if (!d) return "No expiry set";
  const n = daysBetween(now, d);
  if (n < 0) return "Expired";
  if (n === 0) return "Expires today";
  if (n === 1) return "Expires tomorrow";
  return `Expires in ${n} days`;
}

export function isOfferExpired(offer: Offer, now = startOfToday()): boolean {
  if (offer.status === "Expired") return true;
  if (
    offer.status === "Accepted" ||
    offer.status === "Declined" ||
    offer.status === "Countered"
  ) {
    return false;
  }
  const d = parseDay(offer.expires);
  if (!d) return false;
  return daysBetween(now, d) < 0;
}

export function effectiveOfferStatus(offer: Offer, now = startOfToday()): OfferStatus {
  if (isOfferExpired(offer, now) && offer.status !== "Accepted") return "Expired";
  return offer.status;
}

export function deriveVerificationTier(
  financing: FinancingType,
  verifiedFunds: boolean,
  explicit?: OfferVerificationTier | null,
): OfferVerificationTier {
  // Facts first — bridges call this after setting verifiedFunds (no hand-set tier literals).
  if (financing === "Cash" && verifiedFunds) return "cash_funds_verified";
  if (financing !== "Cash" && verifiedFunds) {
    // Full underwriting is an AE fact stored as explicit; otherwise docs-verified rung.
    if (explicit === "fully_underwritten") return "fully_underwritten";
    return "preapproved_docs_verified";
  }
  if (explicit && explicit !== "self_reported") return explicit;
  return "self_reported";
}

export function verificationBadge(offer: Offer): string {
  return VERIFICATION_BADGE[
    deriveVerificationTier(offer.financing, offer.verifiedFunds, offer.verificationTier)
  ];
}

export function verificationDetail(offer: Offer): string {
  const tier = deriveVerificationTier(
    offer.financing,
    offer.verifiedFunds,
    offer.verificationTier,
  );
  switch (tier) {
    case "cash_funds_verified":
      return "Platform verified proof of funds for a cash purchase.";
    case "fully_underwritten":
      return "Lender completed full underwriting against the buyer's documents.";
    case "preapproved_docs_verified":
      return "Pre-approval documents were checked in the platform vault.";
    default:
      return "Buyer self-reported financing — documents not yet verified on platform.";
  }
}

/** Estimated net = price − Realora 1% − buyer-agent 1% (only if agent attached and co-broke on). */
export function estimateOfferNet(
  price: number,
  agentAttached: boolean,
  coBrokeOn: boolean,
  concessions = 0,
): NetBreakdown {
  const realoraFee = Math.round(price * 0.01);
  const buyerAgentFee =
    agentAttached && coBrokeOn ? Math.round(price * 0.01) : 0;
  return {
    price,
    realoraFee,
    buyerAgentFee,
    concessions,
    net: price - realoraFee - buyerAgentFee - concessions,
    agentAttached,
    coBrokeOn,
  };
}

export function offerNet(offer: Offer, listing: Listing | undefined): NetBreakdown {
  return estimateOfferNet(
    offer.price,
    offer.agentAttached,
    (listing?.offerBuyerAgentPercent ?? 0) === 1,
    offer.concessions,
  );
}

export function agentRowLabel(offer: Offer, listing: Listing | undefined): string {
  if (!offer.agentAttached) return "None (direct buyer)";
  if ((listing?.offerBuyerAgentPercent ?? 0) === 1) return "Attached — 1% co-broke";
  return "Attached — no co-broke offered";
}

export function contingencyChips(offer: Offer): string[] {
  const chips: string[] = [];
  if (offer.inspectionContingency) chips.push("Inspection");
  if (offer.financingContingency) chips.push("Financing");
  if (!chips.length) chips.push("None");
  return chips;
}

/**
 * One-line Realora read from structured terms (cards + drawer share this).
 * AE note replaces when present. Names the trade-off — does not restate the badge alone.
 */
export function offerRead(offer: Offer, peers: Offer[], listing: Listing | undefined): string {
  const ae = offer.note.trim();
  if (ae) return ae;

  const live = peers.filter((o) => !isOfferExpired(o) || o.id === offer.id);
  const nets = new Map(live.map((o) => [o.id, offerNet(o, listing).net]));
  const myNet = nets.get(offer.id) ?? 0;
  const maxNet = Math.max(...[...nets.values()], 0);
  const isHighestNet = myNet === maxNet && live.length > 1;

  const myTier = TIER_STRENGTH[
    deriveVerificationTier(offer.financing, offer.verifiedFunds, offer.verificationTier)
  ];
  const maxTier = Math.max(
    ...live.map(
      (o) =>
        TIER_STRENGTH[
          deriveVerificationTier(o.financing, o.verifiedFunds, o.verificationTier)
        ],
    ),
    0,
  );
  const isStrongestCertainty = myTier === maxTier && live.length > 1;

  const myClose = parseDay(offer.closeDate);
  const closes = live
    .map((o) => parseDay(o.closeDate))
    .filter((d): d is Date => Boolean(d));
  const closeTimes = closes.map((d) => d.getTime());
  const fastest =
    myClose && closeTimes.length
      ? myClose.getTime() === Math.min(...closeTimes)
      : false;
  const slowest =
    myClose && closeTimes.length
      ? myClose.getTime() === Math.max(...closeTimes)
      : false;

  const contingencyLoad =
    Number(offer.inspectionContingency) + Number(offer.financingContingency);
  const selfReported =
    deriveVerificationTier(offer.financing, offer.verifiedFunds, offer.verificationTier) ===
    "self_reported";

  // High net with weak certainty / heavy contingencies — name the trade-off.
  if (isHighestNet && selfReported) {
    const parts: string[] = [];
    if (contingencyLoad >= 2) parts.push("with two contingencies");
    else if (contingencyLoad === 1) parts.push("with an open contingency");
    if (slowest) parts.push("and the slowest close");
    const tail = parts.length ? `, ${parts.join(" ")}` : "";
    return `Highest net — but self-reported${tail}.`;
  }

  if (isStrongestCertainty && offer.financing === "Cash" && offer.verifiedFunds) {
    return fastest
      ? "Highest certainty — cash, verified funds, fastest close."
      : "Highest certainty — cash with verified funds.";
  }

  if (isStrongestCertainty && !isHighestNet) {
    return fastest
      ? "Strongest certainty among live offers — fastest close too."
      : "Strongest certainty among live offers — price trails the top net.";
  }

  if (isHighestNet && contingencyLoad >= 2) {
    return "Highest net — but inspection and financing contingencies are both open.";
  }

  if (isHighestNet) {
    return "Highest estimated net among live offers.";
  }

  if (fastest && contingencyLoad === 0) {
    return "Fastest close with no contingencies.";
  }

  if (fastest) {
    return "Fastest proposed close among live offers.";
  }

  if (contingencyLoad >= 2) {
    return "More contingency risk — inspection and financing both open.";
  }

  if (selfReported && offer.financing === "Jumbo") {
    return "Jumbo financing still self-reported — more certainty risk than cash.";
  }

  return `${offer.financing} · balanced terms at ${formatMoney(offer.price)}.`;
}

export function certaintyStrength(offer: Offer): number {
  return TIER_STRENGTH[
    deriveVerificationTier(offer.financing, offer.verifiedFunds, offer.verificationTier)
  ];
}

export function sortOffers(
  offers: Offer[],
  sort: OfferSort,
  listing: Listing | undefined,
): Offer[] {
  const live: Offer[] = [];
  const expired: Offer[] = [];
  for (const o of offers) {
    if (isOfferExpired(o)) expired.push(o);
    else live.push(o);
  }

  const cmp = (a: Offer, b: Offer) => {
    if (sort === "price") return b.price - a.price;
    if (sort === "close") {
      const ad = parseDay(a.closeDate)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bd = parseDay(b.closeDate)?.getTime() ?? Number.POSITIVE_INFINITY;
      return ad - bd;
    }
    if (sort === "net") {
      return offerNet(b, listing).net - offerNet(a, listing).net;
    }
    // Default platform rank: net, then certainty
    const netDiff = offerNet(b, listing).net - offerNet(a, listing).net;
    if (netDiff !== 0) return netDiff;
    return certaintyStrength(b) - certaintyStrength(a);
  };

  live.sort(cmp);
  expired.sort(cmp);
  return [...live, ...expired];
}

export function strongestCertaintyLabel(offers: Offer[]): string | null {
  const live = offers.filter((o) => !isOfferExpired(o));
  if (!live.length) return null;
  let best = live[0];
  for (const o of live) {
    if (certaintyStrength(o) > certaintyStrength(best)) best = o;
  }
  return best.buyerLabel;
}

export function highestNet(offers: Offer[], listing: Listing | undefined): number | null {
  const live = offers.filter((o) => !isOfferExpired(o));
  if (!live.length) return null;
  return Math.max(...live.map((o) => offerNet(o, listing).net));
}

export function downPaymentDollars(offer: Offer): number {
  return Math.round((offer.price * offer.downPercent) / 100);
}

export function demoExpiryFromSeedTime(daysFromNow: number, from = new Date()): string {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
