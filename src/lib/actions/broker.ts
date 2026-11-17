"use server";

import { insertEvent, isStaff, requireActor } from "@/lib/actions/actor";
import { DealActionError, wrapError, type ActionResult } from "@/lib/actions/errors";
import { getSnapshotAction, type AppSnapshot } from "@/lib/actions/snapshot";
import { STALL_DAYS } from "@/lib/config/supervision";
import { loadBrokerageIdentity } from "@/lib/compliance/identity";
import { designatedConsentsSigned, isAcknowledgedDocument } from "@/lib/compliance/gates";
import { listingFromRows } from "@/lib/data/map";
import { isProductionDataMode } from "@/lib/data/mode";
import type { Json, Tables } from "@/lib/database.types";
import type { Listing } from "@/lib/types";

async function fresh(): Promise<ActionResult<AppSnapshot>> {
  return getSnapshotAction();
}

function requireBrokerActor(actor: Awaited<ReturnType<typeof requireActor>>) {
  if (!isStaff(actor)) throw new DealActionError("forbidden", "Broker of record only.");
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

const ACCEPTED_PLUS = [
  "accepted",
  "contract",
  "in_contract",
  "diligence",
  "clear_to_close",
  "closing",
  "post_close",
];

export type BrokerOverview = {
  byState: { state: string; count: number; deals: { id: string; address: string; state: string }[] }[];
  stalled: { id: string; address: string; state: string; lastEventAt: string | null }[];
  stallDays: number;
  pendingApprovals: number;
  feePipeline: { projected: number; invoiced: number; disbursed: number };
  identity: { legalName: string; licenseNumber: string; placeholder: boolean };
  production: boolean;
};

export async function getBrokerOverviewAction(): Promise<ActionResult<BrokerOverview>> {
  try {
    const actor = await requireActor();
    requireBrokerActor(actor);
    const [{ data: deals }, { data: listings }, { data: properties }, { data: events }, { data: money }, pendingRes] =
      await Promise.all([
        actor.admin.from("deals").select("id, listing_id, state, paused"),
        actor.admin.from("listings").select("id, property_id"),
        actor.admin.from("properties").select("id, address_line, city, state"),
        actor.admin.from("events").select("deal_id, created_at").order("created_at", { ascending: false }),
        actor.admin.from("money_events").select("deal_id, kind, amount_cents, status"),
        actor.admin.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
    const pendingCount = pendingRes.count ?? 0;

    const listingById = new Map((listings ?? []).map((l) => [l.id, l]));
    const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));
    const lastEvent = new Map<string, string>();
    for (const ev of events ?? []) {
      if (!ev.deal_id) continue;
      if (!lastEvent.has(ev.deal_id)) lastEvent.set(ev.deal_id, ev.created_at);
    }

    const addressOf = (deal: { id: string; listing_id: string }) => {
      const listing = listingById.get(deal.listing_id);
      const property = listing ? propertyById.get(listing.property_id) : undefined;
      return property?.address_line ?? deal.id.slice(0, 8);
    };

    const groups = new Map<string, { id: string; address: string; state: string }[]>();
    for (const deal of deals ?? []) {
      const row = { id: deal.id, address: addressOf(deal), state: deal.state };
      const list = groups.get(deal.state) ?? [];
      list.push(row);
      groups.set(deal.state, list);
    }
    const byState = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([state, rows]) => ({ state, count: rows.length, deals: rows }));

    const cutoff = Date.now() - STALL_DAYS * 86400000;
    const stalled = (deals ?? [])
      .filter((d) => d.state !== "post_close" && d.state !== "fell_through")
      .map((d) => {
        const last = lastEvent.get(d.id) ?? null;
        return { id: d.id, address: addressOf(d), state: d.state, lastEventAt: last };
      })
      .filter((d) => !d.lastEventAt || new Date(d.lastEventAt).getTime() < cutoff);

    const { data: acceptedOffers } = await actor.admin
      .from("offers")
      .select("deal_id, price_cents, status")
      .eq("status", "accepted");
    const acceptedByDeal = new Map((acceptedOffers ?? []).map((o) => [o.deal_id, Number(o.price_cents)]));
    const invoicedKinds = new Set(["platform_fee", "buyer_agent_fee"]);
    let invoiced = 0;
    let disbursed = 0;
    const invoicedDeals = new Set<string>();
    for (const row of money ?? []) {
      const amount = Number(row.amount_cents ?? 0);
      if (row.status === "disbursed") disbursed += amount;
      if (invoicedKinds.has(row.kind) && (row.status === "due" || row.status === "invoiced" || row.status === "paid")) {
        invoiced += amount;
        invoicedDeals.add(row.deal_id);
      }
    }
    let projected = 0;
    for (const deal of deals ?? []) {
      if (!ACCEPTED_PLUS.includes(deal.state)) continue;
      if (invoicedDeals.has(deal.id)) continue;
      const price = acceptedByDeal.get(deal.id);
      if (price != null) projected += Math.round(price * 0.01);
    }

    const identity = await loadBrokerageIdentity(actor.admin);
    return {
      ok: true,
      data: {
        byState,
        stalled,
        stallDays: STALL_DAYS,
        pendingApprovals: pendingCount,
        feePipeline: { projected, invoiced, disbursed },
        identity,
        production: isProductionDataMode(),
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}

export type ApprovalPacket = {
  approval: Tables<"approvals">;
  deal: Tables<"deals">;
  address: string;
  listingPriceCents: number;
  triggeringEvent: Tables<"events"> | null;
  documents: { id: string; name: string; status: string | null; kind: string | null; acknowledged?: boolean }[];
  recommendation: Record<string, unknown> | null;
  requestedByName: string | null;
};

export async function getApprovalsQueueAction(): Promise<ActionResult<ApprovalPacket[]>> {
  try {
    const actor = await requireActor();
    requireBrokerActor(actor);
    const { data: rows } = await actor.admin
      .from("approvals")
      .select("*")
      .in("status", ["pending", "changes_requested"])
      .order("created_at", { ascending: true });
    // Seller-signed listing agreements must have a real countersign approval row.
    // Create any missing ones (legacy Signed docs) before building the queue.
    const { data: awaiting } = await actor.admin
      .from("documents")
      .select("id, deal_id, name, status")
      .eq("status", "Signed");
    const pendingCountersignDeals = new Set(
      (rows ?? [])
        .filter((a) => a.kind === "listing_agreement_countersign")
        .map((a) => a.deal_id),
    );
    const { insertApprovalRequest } = await import("@/lib/actions/approvals");
    for (const doc of awaiting ?? []) {
      if (!/listing agreement/i.test(doc.name) || !doc.deal_id) continue;
      if (pendingCountersignDeals.has(doc.deal_id)) continue;
      await insertApprovalRequest(actor.admin, {
        dealId: doc.deal_id,
        kind: "listing_agreement_countersign",
        requestedBy: null,
        context: { document_id: doc.id },
      });
      pendingCountersignDeals.add(doc.deal_id);
    }

    const { data: refreshed } = await actor.admin
      .from("approvals")
      .select("*")
      .in("status", ["pending", "changes_requested"])
      .order("created_at", { ascending: true });

    const packets: ApprovalPacket[] = [];
    for (const approval of refreshed ?? []) {
      packets.push(await buildPacket(actor, approval));
    }

    return { ok: true, data: packets };
  } catch (error) {
    return wrapError(error);
  }
}

async function buildPacket(
  actor: Awaited<ReturnType<typeof requireActor>>,
  approval: Tables<"approvals">,
): Promise<ApprovalPacket> {
  const { data: deal } = await actor.admin.from("deals").select("*").eq("id", approval.deal_id).maybeSingle();
  if (!deal) throw new DealActionError("not_found", "Deal not found.");
  const { data: listing } = await actor.admin.from("listings").select("*").eq("id", deal.listing_id).maybeSingle();
  const { data: property } = listing
    ? await actor.admin.from("properties").select("*").eq("id", listing.property_id).maybeSingle()
    : { data: null };
  const { data: events } = await actor.admin
    .from("events")
    .select("*")
    .eq("deal_id", deal.id)
    .order("created_at", { ascending: false })
    .limit(25);
  const triggering =
    (events ?? []).find((e) => e.type === "broker.approval.requested" && asRecord(e.payload).approval_id === approval.id) ??
    (events ?? [])[0] ??
    null;
  const { data: documents } = await actor.admin
    .from("documents")
    .select("id, name, status, kind, extracted")
    .eq("deal_id", deal.id)
    .neq("status", "deleted");
  const { data: requester } = approval.requested_by
    ? await actor.admin.from("profiles").select("full_name, email").eq("id", approval.requested_by).maybeSingle()
    : { data: null };

  let recommendation: Record<string, unknown> | null = asRecord(approval.context).recommendation
    ? (asRecord(approval.context).recommendation as Record<string, unknown>)
    : null;

  if (approval.kind === "extraction_confirmation") {
    const docId = asRecord(approval.context).document_id;
    const doc = (documents ?? []).find((d) => d.id === docId);
    if (doc) recommendation = { extraction: asRecord(doc.extracted) };
  }
  if (approval.kind === "verification_review") {
    const userId = asRecord(approval.context).user_id;
    if (typeof userId === "string") {
      const { data: verification } = await actor.admin
        .from("verifications")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      const owners = asRecord(property?.acris_payload ?? null).owners;
      recommendation = { verification, acris_owners: owners ?? null };
    }
  }
  if (approval.kind === "designated_agency") {
    const consents = await designatedConsentsSigned(actor.admin, deal.id);
    recommendation = {
      seller_consent: consents.sellerDoc
        ? { id: consents.sellerDoc.id, name: consents.sellerDoc.name, signed: consents.seller }
        : null,
      buyer_consent: consents.buyerDoc
        ? { id: consents.buyerDoc.id, name: consents.buyerDoc.name, signed: consents.buyer }
        : consents.sellerDoc
          ? { id: consents.sellerDoc.id, name: consents.sellerDoc.name, signed: consents.buyer }
          : null,
    };
  }
  if (approval.kind === "deposit_confirmation" || approval.kind === "contract_execution") {
    const { data: offer } = await actor.admin
      .from("offers")
      .select("price_cents, emd_cents, ai_note, certainty_label")
      .eq("deal_id", deal.id)
      .eq("status", "accepted")
      .maybeSingle();
    recommendation = { scoring: offer };
  }

  return {
    approval,
    deal,
    address: property?.address_line ?? deal.id.slice(0, 8),
    listingPriceCents: Number(listing?.price_cents ?? 0),
    triggeringEvent: triggering,
    documents: (documents ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      kind: d.kind,
      acknowledged: isAcknowledgedDocument(d),
    })),
    recommendation,
    requestedByName: requester?.full_name || requester?.email || null,
  };
}

export type SupervisionFile = {
  deal: Tables<"deals">;
  address: string;
  paused: boolean;
  pausedReason: string | null;
  events: Tables<"events">[];
  documents: Tables<"documents">[];
  messages: Tables<"messages">[];
  parties: (Tables<"deal_parties"> & { name: string | null; email: string | null })[];
  offers: Tables<"offers">[];
  listing: Listing | null;
};

export async function getDealSupervisionAction(dealId: string): Promise<ActionResult<SupervisionFile>> {
  try {
    const actor = await requireActor();
    requireBrokerActor(actor);
    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", dealId).maybeSingle();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    const { data: listing } = await actor.admin.from("listings").select("*").eq("id", deal.listing_id).maybeSingle();
    const { data: property } = listing
      ? await actor.admin.from("properties").select("*").eq("id", listing.property_id).maybeSingle()
      : { data: null };
    const [{ data: events }, { data: documents }, { data: messages }, { data: parties }, { data: offers }] =
      await Promise.all([
        actor.admin.from("events").select("*").eq("deal_id", dealId).order("created_at", { ascending: true }),
        actor.admin.from("documents").select("*").eq("deal_id", dealId).neq("status", "deleted"),
        actor.admin.from("messages").select("*").eq("deal_id", dealId).order("created_at", { ascending: true }),
        actor.admin.from("deal_parties").select("*").eq("deal_id", dealId),
        actor.admin.from("offers").select("*").eq("deal_id", dealId),
      ]);
    const userIds = [...new Set((parties ?? []).map((p) => p.user_id))];
    const { data: profiles } = userIds.length
      ? await actor.admin.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    return {
      ok: true,
      data: {
        deal,
        address: property?.address_line ?? dealId.slice(0, 8),
        paused: Boolean(deal.paused),
        pausedReason: deal.paused_reason,
        events: events ?? [],
        documents: documents ?? [],
        messages: messages ?? [],
        parties: (parties ?? []).map((p) => ({
          ...p,
          name: profileById.get(p.user_id)?.full_name ?? null,
          email: profileById.get(p.user_id)?.email ?? null,
        })),
        offers: offers ?? [],
        listing: listing && property ? listingFromRows(listing, property) : null,
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}

export async function listBrokerDealsAction(): Promise<
  ActionResult<{ id: string; address: string; state: string; paused: boolean }[]>
> {
  try {
    const actor = await requireActor();
    requireBrokerActor(actor);
    const { data: deals } = await actor.admin.from("deals").select("id, listing_id, state, paused");
    const { data: listings } = await actor.admin.from("listings").select("id, property_id");
    const { data: properties } = await actor.admin.from("properties").select("id, address_line");
    const listingById = new Map((listings ?? []).map((l) => [l.id, l]));
    const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));
    return {
      ok: true,
      data: (deals ?? []).map((d) => {
        const listing = listingById.get(d.listing_id);
        const property = listing ? propertyById.get(listing.property_id) : undefined;
        return {
          id: d.id,
          address: property?.address_line ?? d.id.slice(0, 8),
          state: d.state,
          paused: Boolean(d.paused),
        };
      }),
    };
  } catch (error) {
    return wrapError(error);
  }
}

export async function pauseDealAction(
  dealId: string,
  reason: string,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    requireBrokerActor(actor);
    const note = reason.trim();
    if (!note) throw new DealActionError("validation", "A pause reason is required.");
    const { error } = await actor.admin
      .from("deals")
      .update({ paused: true, paused_reason: note, updated_at: new Date().toISOString() })
      .eq("id", dealId);
    if (error) throw new DealActionError("validation", error.message);
    await insertEvent(actor.admin, dealId, actor.userId, "broker.deal.paused", { reason: note });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function unpauseDealAction(dealId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    requireBrokerActor(actor);
    const { error } = await actor.admin
      .from("deals")
      .update({ paused: false, paused_reason: null, updated_at: new Date().toISOString() })
      .eq("id", dealId);
    if (error) throw new DealActionError("validation", error.message);
    await insertEvent(actor.admin, dealId, actor.userId, "broker.deal.unpaused", {});
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function addSupervisionNoteAction(
  dealId: string,
  note: string,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    requireBrokerActor(actor);
    const body = note.trim();
    if (!body) throw new DealActionError("validation", "Note cannot be empty.");
    await insertEvent(actor.admin, dealId, actor.userId, "broker.supervision.note", { note: body });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function listAssignableUsersAction(): Promise<
  ActionResult<{ id: string; name: string; email: string | null; appRole: string }[]>
> {
  try {
    const actor = await requireActor();
    requireBrokerActor(actor);
    const { data } = await actor.admin.from("profiles").select("id, full_name, email, app_role");
    return {
      ok: true,
      data: (data ?? []).map((p) => ({
        id: p.id,
        name: p.full_name || p.email || p.id.slice(0, 8),
        email: p.email,
        appRole: p.app_role,
      })),
    };
  } catch (error) {
    return wrapError(error);
  }
}
