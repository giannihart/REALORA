import { BUYER_PERSONA_OFFER_ID, documents as seedDocuments, threads as seedThreads } from "@/data/seed";
import { latLngToPin } from "@/lib/nyc/map-bounds";
import type { Json, Tables } from "@/lib/database.types";
import type {
  Booking,
  ChatMessage,
  Deal,
  DealState,
  DocumentGroup,
  DocumentItem,
  DocumentStatus,
  FinancingType,
  HomeType,
  Listing,
  ListingBadge,
  ListingStatus,
  MessageThread,
  Offer,
  OfferStatus,
  Role,
  TourFeedback,
} from "@/lib/types";

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export const DEAL_STATE_TO_DB: Record<DealState, Tables<"deals">["state"]> = {
  INTAKE: "intake",
  PREP: "prep",
  LIVE: "live",
  TOURS_OFFERS: "tours_offers",
  ACCEPTED: "accepted",
  CONTRACT: "contract",
  IN_CONTRACT: "in_contract",
  DILIGENCE: "diligence",
  CLEAR_TO_CLOSE: "clear_to_close",
  CLOSING: "closing",
  POST_CLOSE: "post_close",
  FELL_THROUGH: "fell_through",
};

export const DEAL_STATE_FROM_DB: Record<Tables<"deals">["state"], DealState> = {
  intake: "INTAKE",
  prep: "PREP",
  live: "LIVE",
  tours_offers: "TOURS_OFFERS",
  accepted: "ACCEPTED",
  contract: "CONTRACT",
  in_contract: "IN_CONTRACT",
  diligence: "DILIGENCE",
  clear_to_close: "CLEAR_TO_CLOSE",
  closing: "CLOSING",
  post_close: "POST_CLOSE",
  fell_through: "FELL_THROUGH",
};

export function listingStatusToDb(status: ListingStatus): Tables<"listings">["status"] {
  if (status === "in_contract") return "under_contract";
  if (status === "draft") return "draft";
  if (status === "closed") return "closed";
  if (status === "withdrawn") return "withdrawn";
  return "live";
}

export function listingStatusFromDb(status: Tables<"listings">["status"]): ListingStatus {
  if (status === "under_contract") return "in_contract";
  if (status === "draft") return "draft";
  if (status === "closed") return "closed";
  if (status === "withdrawn") return "withdrawn";
  return "live";
}

export function financingToDb(f: FinancingType): Tables<"offers">["financing"] {
  if (f === "Cash") return "cash";
  if (f === "Jumbo") return "jumbo";
  return "conventional";
}

export function financingFromDb(f: Tables<"offers">["financing"]): FinancingType {
  if (f === "cash") return "Cash";
  if (f === "jumbo") return "Jumbo";
  return "Conventional";
}

export function offerStatusFromDb(s: Tables<"offers">["status"]): OfferStatus {
  switch (s) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "countered":
      return "Countered";
    case "expired":
      return "Expired";
    case "under_review":
      return "Viewed";
    default:
      return "New";
  }
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function payloadSlug(payload: Json | null | undefined): string | undefined {
  const slug = asRecord(payload).slug;
  return typeof slug === "string" ? slug : undefined;
}

export function listingFromRows(
  listing: Tables<"listings">,
  property: Tables<"properties">,
): Listing {
  const extra = asRecord(property.acris_payload);
  const media = Array.isArray(listing.media) ? [...listing.media] : [];
  media.sort((a, b) => {
    const pa = a && typeof a === "object" && "position" in a ? Number((a as { position?: unknown }).position) : 0;
    const pb = b && typeof b === "object" && "position" in b ? Number((b as { position?: unknown }).position) : 0;
    return pa - pb;
  });
  const photos = media
    .map((item) => {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (!item || typeof item !== "object") return "";
      const kind = "kind" in item ? (item as { kind?: unknown }).kind : "photo";
      if (kind != null && kind !== "photo" && kind !== "image") return "";
      const record = item as { url?: unknown; src?: unknown; path?: unknown };
      for (const key of ["url", "src", "path"] as const) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
      return "";
    })
    .filter(Boolean);
  const about = Array.isArray(extra.about) ? (extra.about as string[]) : [];
  const storedPin = extra.pin as { x: number; y: number } | undefined;
  const lat = typeof property.lat === "number" ? property.lat : undefined;
  const lng = typeof property.lng === "number" ? property.lng : undefined;
  const pin =
    storedPin ??
    (lat != null && lng != null ? latLngToPin(lat, lng) : { x: 50, y: 50 });
  const syndication = Array.isArray(extra.syndication)
    ? (extra.syndication as Listing["syndication"])
    : [];
  const stagingLabels = Array.isArray(extra.stagingLabels)
    ? (extra.stagingLabels as string[])
    : [];

  return {
    id: typeof extra.slug === "string" ? extra.slug : listing.id,
    title: typeof extra.title === "string" ? extra.title : property.address_line,
    address: property.address_line,
    neighborhood: typeof extra.neighborhood === "string" ? extra.neighborhood : "",
    borough: property.borough ?? "",
    city: property.city ?? "",
    state: property.state ?? "NY",
    zip: property.zip ?? "",
    price: centsToDollars(Number(listing.price_cents)),
    beds: Number(property.beds ?? 0),
    baths: Number(property.baths ?? 0),
    sqft: property.sqft ?? 0,
    type: (property.property_type as HomeType) ?? "Townhouse",
    yearBuilt: property.year_built ?? 0,
    lotSqft: typeof extra.lotSqft === "number" ? extra.lotSqft : 0,
    heating: typeof extra.heating === "string" ? extra.heating : "",
    taxes: typeof extra.taxes === "number" ? extra.taxes : 0,
    badge: extra.badge as ListingBadge | undefined,
    photos,
    objectPosition: typeof extra.objectPosition === "string" ? extra.objectPosition : undefined,
    about,
    pin: pin ?? { x: 50, y: 50 },
    pinLabel: typeof extra.pinLabel === "string" ? extra.pinLabel : "",
    lat,
    lng,
    isDemoDeal: extra.isDemoDeal === true,
    marketplace: extra.marketplace !== false,
    status: listingStatusFromDb(listing.status),
    offerBuyerAgentPercent: listing.buyer_agent_offered ? 1 : 0,
    stagingLabels,
    syndication,
    sellerId: listing.seller_id,
    createdAt: listing.created_at,
    mediaCostCents: Number(listing.media_cost_cents ?? 0),
    campaignCostCents: Number(listing.campaign_cost_cents ?? 0),
    pricingGuidance:
      typeof extra.pricingGuidance === "string" ? extra.pricingGuidance : null,
    fromOnboarding: extra.fromOnboarding === true,
  };
}

export function offerFromRow(
  row: Tables<"offers">,
  listingSlug: string,
  buyerUserId: string | null,
): Offer {
  const extra = asRecord(row.contingencies);
  const slug = typeof extra.slug === "string" ? extra.slug : row.id;
  const buyerLabel =
    typeof extra.buyer_label === "string" ? extra.buyer_label : "Buyer";
  const financing = financingFromDb(row.financing);
  const verifiedFunds = row.verified_funds;
  const tierRaw = extra.verification_tier;
  const verificationTier =
    tierRaw === "cash_funds_verified" ||
    tierRaw === "fully_underwritten" ||
    tierRaw === "preapproved_docs_verified" ||
    tierRaw === "self_reported"
      ? tierRaw
      : financing === "Cash" && verifiedFunds
        ? ("cash_funds_verified" as const)
        : verifiedFunds
          ? ("fully_underwritten" as const)
          : ("self_reported" as const);
  return {
    id: slug,
    listingId: listingSlug,
    buyerLabel,
    isBuyerPersona: slug === BUYER_PERSONA_OFFER_ID || (buyerUserId != null && row.buyer_id === buyerUserId),
    price: centsToDollars(Number(row.price_cents)),
    financing,
    downPercent: Number(row.down_pct),
    emd: centsToDollars(Number(row.emd_cents)),
    closeDate: row.close_date ?? "",
    expires: row.expires_at ? row.expires_at.slice(0, 10) : "",
    status: offerStatusFromDb(row.status),
    inspectionContingency: extra.inspection === true,
    financingContingency: extra.financing === true,
    verifiedFunds,
    agentAttached: extra.has_agent === true,
    verificationTier,
    concessions:
      typeof extra.concessions === "number"
        ? extra.concessions
        : typeof extra.concessions_cents === "number"
          ? centsToDollars(extra.concessions_cents)
          : 0,
    note: row.ai_note ?? "",
    certaintyLabel: (row.certainty_label as Offer["certaintyLabel"]) ?? "Competitive",
    score: typeof extra.score === "number" ? extra.score : 0,
    createdAt: row.created_at,
  };
}

export function dealFromRows(
  deal: Tables<"deals">,
  listingSlug: string,
  acceptedOfferSlug: string | null,
  tasks: Tables<"tasks">[],
  extra: Record<string, unknown>,
): Deal {
  const inspectionBooked = tasks.some(
    (t) => /schedule inspection/i.test(t.title) && t.status === "done",
  );
  const inspectionReportReviewed = tasks.some(
    (t) => /review inspection/i.test(t.title) && t.status === "done",
  );
  return {
    listingId: listingSlug,
    state: DEAL_STATE_FROM_DB[deal.state],
    fellThroughReason: deal.fell_through_reason ?? undefined,
    inspectionBooked: inspectionBooked || extra.inspectionBooked === true,
    inspectionReportReviewed:
      inspectionReportReviewed || extra.inspectionReportReviewed === true,
    acceptedOfferId: acceptedOfferSlug,
    preApprovalUploaded: extra.preApprovalUploaded === true,
    contractDocumentId: deal.contract_document_id,
  };
}

const THREAD_META: Record<string, Pick<MessageThread, "name" | "role">> = Object.fromEntries(
  seedThreads.map((t) => [t.id, { name: t.name, role: t.role }]),
);

export function threadsFromMessages(
  rows: Tables<"messages">[],
  profiles: Pick<Tables<"profiles">, "id" | "full_name" | "email">[],
  currentUserId: string | null,
  role: Role,
): { threads: MessageThread[]; messages: ChatMessage[] } {
  const nameOf = (id: string | null) => {
    if (!id) return "Realora";
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || "Party";
  };
  const grouped = new Map<string, Tables<"messages">[]>();
  for (const row of rows) {
    const list = grouped.get(row.thread_key) ?? [];
    list.push(row);
    grouped.set(row.thread_key, list);
  }
  const threads: MessageThread[] = [];
  const messages: ChatMessage[] = [];
  for (const [key, list] of grouped) {
    const meta = THREAD_META[key];
    const last = list[list.length - 1];
    threads.push({
      id: key,
      name: meta?.name ?? nameOf(last?.sender_id ?? null),
      preview: last?.body.slice(0, 80) ?? "",
      unread: 0,
      role: meta?.role ?? "both",
    });
    for (const row of list) {
      messages.push({
        id: row.id,
        threadId: key,
        sender: nameOf(row.sender_id),
        body: row.body,
        at: row.created_at.slice(0, 16).replace("T", " "),
        fromUser: Boolean(currentUserId && row.sender_id === currentUserId),
      });
    }
  }
  threads.sort((a, b) => a.id.localeCompare(b.id));
  void role;
  return { threads, messages };
}

function documentStatusFromDb(status: string | null, seed?: DocumentStatus): DocumentStatus {
  if (status === "completed" || status === "signed" || status === "Signed") return "Signed";
  if (status === "declined" || status === "expired" || status === "For review") return "For review";
  if (status === "Pending" || status === "viewed" || status === "pending") return "Pending";
  return seed ?? "Pending";
}

function roleFromVisibility(visibility: string | null | undefined, seed?: DocumentItem["role"]): DocumentItem["role"] {
  if (visibility === "seller_side") return "seller";
  if (visibility === "buyer_side") return "buyer";
  return seed ?? "both";
}

export function documentsFromRows(rows: Tables<"documents">[]): DocumentItem[] {
  return rows
    .filter((row) => row.status !== "deleted")
    .map((row) => {
      const seed = seedDocuments.find(
        (d) => d.id === row.storage_path?.replace(/^seed:/, "") || d.name === row.name,
      );
      const extracted =
        row.extracted && typeof row.extracted === "object" && !Array.isArray(row.extracted)
          ? (row.extracted as DocumentItem["extracted"])
          : null;
      return {
        id: row.id,
        name: row.name,
        group: (row.kind === "proof_of_funds" || row.kind === "pre_approval"
          ? "Closing"
          : (row.kind as DocumentGroup)) ?? seed?.group ?? "Closing",
        uploadedBy: seed?.uploadedBy ?? "Party",
        date: row.created_at.slice(0, 10),
        status: documentStatusFromDb(row.status, seed?.status),
        body: seed?.body ?? `${row.name.toUpperCase()}\n\nStored in the deal vault.`,
        role: roleFromVisibility(row.visibility, seed?.role),
        dealId: row.deal_id ?? undefined,
        storagePath: row.storage_path,
        visibility: row.visibility,
        signStatus: row.status,
        extracted: extracted ?? null,
        uploaderId: row.uploader_id,
      };
    });
}

export function toursFromPayload(payload: Json): TourFeedback[] {
  const extra = asRecord(payload);
  return Array.isArray(extra.tours) ? (extra.tours as TourFeedback[]) : [];
}

export function bookingsFromPayload(payload: Json): Booking[] {
  const extra = asRecord(payload);
  return Array.isArray(extra.bookings) ? (extra.bookings as Booking[]) : [];
}

export function acrisFromListing(listing: Listing): Json {
  return {
    slug: listing.id,
    title: listing.title,
    neighborhood: listing.neighborhood,
    about: listing.about,
    pin: listing.pin,
    pinLabel: listing.pinLabel,
    heating: listing.heating,
    taxes: listing.taxes,
    lotSqft: listing.lotSqft,
    badge: listing.badge ?? null,
    objectPosition: listing.objectPosition ?? null,
    stagingLabels: listing.stagingLabels,
    syndication: listing.syndication,
    marketplace: listing.marketplace,
    isDemoDeal: listing.isDemoDeal,
  };
}

export function mediaFromListing(listing: Listing): Json {
  return listing.photos.map((url, position) => ({ url, kind: "photo", position }));
}

export type PartyRole = Tables<"deal_parties">["role"];
export type PartySide = Tables<"deal_parties">["side"];

export function portalRoleFromParties(
  parties: { role: PartyRole; side: PartySide }[],
  intent: "buying" | "selling" | "both" | null,
): Role {
  const sides = new Set(parties.map((p) => p.side));
  if (sides.has("buyer") && !sides.has("seller")) return "buyer";
  if (sides.has("seller") && !sides.has("buyer")) return "seller";
  if (intent === "selling") return "seller";
  return "buyer";
}

export function canSwitchRoles(
  parties: { side: PartySide }[],
  intent: "buying" | "selling" | "both" | null,
): boolean {
  const sides = new Set(parties.map((p) => p.side));
  if (sides.has("buyer") && sides.has("seller")) return true;
  return intent === "both";
}
