import "server-only";
import { DealActionError } from "@/lib/actions/errors";
import { isProductionDataMode } from "@/lib/data/mode";
import type { Json, Tables } from "@/lib/database.types";
import type { createServiceRoleClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createServiceRoleClient>;

const ACCEPTED_PLUS: Tables<"deals">["state"][] = [
  "accepted",
  "contract",
  "in_contract",
  "diligence",
  "clear_to_close",
  "closing",
  "post_close",
];

export function assertNotPaused(deal: { paused?: boolean | null; paused_reason?: string | null }) {
  if (deal.paused) {
    throw new DealActionError(
      "paused",
      deal.paused_reason
        ? `This deal is paused by the broker of record: ${deal.paused_reason}`
        : "This deal is paused by the broker of record.",
    );
  }
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

export function isAcknowledgedDocument(doc: {
  name: string;
  status: string | null;
  extracted: Json | null;
  uploader_id?: string | null;
}) {
  const extra = asRecord(doc.extracted);
  if (typeof extra.acknowledged_at === "string" && extra.acknowledged_at.length > 0) return true;
  const status = (doc.status ?? "").toLowerCase();
  return status === "completed" || status === "signed" || status === "complete";
}

export function isAgencyDisclosureDoc(doc: { name: string; kind?: string | null }) {
  return /agency disclosure/i.test(doc.name);
}

export function isDesignatedConsentDoc(doc: { name: string }, side: "seller" | "buyer") {
  const re = side === "seller" ? /designated agency consent — seller/i : /designated agency consent — buyer/i;
  return re.test(doc.name) || /dual \/ designated agency consent/i.test(doc.name);
}

export async function hasAcknowledgedDisclosure(
  admin: Admin,
  dealId: string,
  userId: string,
): Promise<boolean> {
  const { data: docs } = await admin
    .from("documents")
    .select("id, name, status, extracted, uploader_id")
    .eq("deal_id", dealId)
    .neq("status", "deleted");
  return (docs ?? []).some((doc) => {
    if (!isAgencyDisclosureDoc(doc)) return false;
    if (!isAcknowledgedDocument(doc)) return false;
    const extra = asRecord(doc.extracted);
    return extra.user_id === userId || doc.uploader_id === userId;
  });
}

export async function assertAgencyDisclosure(admin: Admin, dealId: string, userId: string) {
  if (!isProductionDataMode()) return;
  const ok = await hasAcknowledgedDisclosure(admin, dealId, userId);
  if (!ok) {
    throw new DealActionError(
      "disclosure_required",
      "New York Agency Disclosure must be acknowledged before this action.",
    );
  }
}

export function isDirectPlatformBuyer(offer: Tables<"offers"> | null | undefined) {
  if (!offer) return true;
  const extra = asRecord(offer.contingencies);
  return extra.has_agent !== true;
}

export function isBothSidesOpportunity(
  parties: Tables<"deal_parties">[],
  offer: Tables<"offers"> | null | undefined,
) {
  const hasSeller = parties.some((p) => p.side === "seller");
  const hasBuyer = parties.some((p) => p.side === "buyer") || Boolean(offer?.buyer_id);
  return hasSeller && hasBuyer && isDirectPlatformBuyer(offer);
}

export async function designatedConsentsSigned(
  admin: Admin,
  dealId: string,
): Promise<{ seller: boolean; buyer: boolean; sellerDoc: Tables<"documents"> | null; buyerDoc: Tables<"documents"> | null }> {
  const { data: docs } = await admin
    .from("documents")
    .select("*")
    .eq("deal_id", dealId)
    .neq("status", "deleted");
  const sellerDoc = (docs ?? []).find((d) => /designated agency consent — seller/i.test(d.name)) ?? null;
  const buyerDoc = (docs ?? []).find((d) => /designated agency consent — buyer/i.test(d.name)) ?? null;
  const combined = (docs ?? []).find((d) => /dual \/ designated agency consent/i.test(d.name)) ?? null;

  if (sellerDoc || buyerDoc) {
    return {
      seller: sellerDoc ? isAcknowledgedDocument(sellerDoc) : false,
      buyer: buyerDoc ? isAcknowledgedDocument(buyerDoc) : false,
      sellerDoc,
      buyerDoc,
    };
  }
  if (combined) {
    const extra = asRecord(combined.extracted);
    return {
      seller: Boolean(extra.seller_acknowledged_at),
      buyer: Boolean(extra.buyer_acknowledged_at),
      sellerDoc: combined,
      buyerDoc: combined,
    };
  }
  return { seller: false, buyer: false, sellerDoc: null, buyerDoc: null };
}

export async function latestDesignatedAgencyApproval(admin: Admin, dealId: string) {
  const { data } = await admin
    .from("approvals")
    .select("*")
    .eq("deal_id", dealId)
    .eq("kind", "designated_agency")
    .eq("status", "approved")
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export function assignedAgents(approval: Tables<"approvals"> | null | undefined): {
  agentSeller: string | null;
  agentBuyer: string | null;
} {
  if (!approval) return { agentSeller: null, agentBuyer: null };
  const ctx = asRecord(approval.context);
  const agentSeller =
    typeof ctx.agent_seller === "string"
      ? ctx.agent_seller
      : typeof ctx.agent_seller_user_id === "string"
        ? ctx.agent_seller_user_id
        : null;
  const agentBuyer =
    typeof ctx.agent_buyer === "string"
      ? ctx.agent_buyer
      : typeof ctx.agent_buyer_user_id === "string"
        ? ctx.agent_buyer_user_id
        : null;
  return { agentSeller, agentBuyer };
}

export async function assertDesignatedAgencyGate(
  admin: Admin,
  dealId: string,
  parties: Tables<"deal_parties">[],
  offer: Tables<"offers"> | null | undefined,
) {
  if (!isProductionDataMode()) return;
  if (!isBothSidesOpportunity(parties, offer)) return;

  const consents = await designatedConsentsSigned(admin, dealId);
  const approval = await latestDesignatedAgencyApproval(admin, dealId);
  const { agentSeller, agentBuyer } = assignedAgents(approval);

  const missingConsent = !consents.seller || !consents.buyer;
  const missingAgents = !agentSeller || !agentBuyer || agentSeller === agentBuyer;

  if (missingConsent || missingAgents) {
    throw new DealActionError(
      "designated_agency_required",
      missingConsent
        ? "Designated-agency consents from seller and buyer are required before accepting a both-sides offer."
        : "Broker of record must assign two different designated agents before accepting a both-sides offer.",
    );
  }
}

export function acceptedPlusStates() {
  return ACCEPTED_PLUS;
}
