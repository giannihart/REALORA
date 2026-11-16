"use server";

import { scoreOffer } from "@/lib/scoring";
import type { OfferDraft } from "@/lib/types";
import { dollarsToCents, financingToDb } from "@/lib/data/map";
import {
  assertParty,
  assertState,
  hasRole,
  insertEvent,
  insertTaskRows,
  isSellerSide,
  isStaff,
  loadParties,
  requireActor,
} from "@/lib/actions/actor";
import { DealActionError, fail, wrapError, type ActionResult } from "@/lib/actions/errors";
import { getSnapshotAction, type AppSnapshot } from "@/lib/actions/snapshot";
import {
  assertAgencyDisclosure,
  assertDesignatedAgencyGate,
  assertNotPaused,
} from "@/lib/compliance/gates";
import { isProductionDataMode } from "@/lib/data/mode";
import type { Json, Tables } from "@/lib/database.types";

const OPEN_OFFER = ["new", "under_review", "countered"] as const;
const SELLER_OWNERS: Tables<"deal_parties">["role"][] = ["seller", "co_seller"];
const CONTRACT_ROLES: Tables<"deal_parties">["role"][] = ["broker_of_record", "agent_seller"];
const TERMINAL = ["post_close", "fell_through"];

async function fresh(): Promise<ActionResult<AppSnapshot>> {
  return getSnapshotAction();
}

async function resolveOffer(
  admin: ReturnType<typeof requireActor> extends Promise<infer A>
    ? A extends { admin: infer X }
      ? X
      : never
    : never,
  dealId: string,
  offerId: string,
): Promise<Tables<"offers">> {
  const { data: rows, error } = await admin.from("offers").select("*").eq("deal_id", dealId);
  if (error) throw new DealActionError("validation", error.message);
  const found = (rows ?? []).find((o) => {
    const extra =
      o.contingencies && typeof o.contingencies === "object" && !Array.isArray(o.contingencies)
        ? (o.contingencies as Record<string, unknown>)
        : {};
    return o.id === offerId || extra.slug === offerId;
  });
  if (!found) throw new DealActionError("not_found", "Offer not found.");
  return found;
}

async function stampMilestone(
  admin: Awaited<ReturnType<typeof requireActor>>["admin"],
  dealId: string,
  audience: "buyer" | "seller",
  key: string,
  status: Tables<"milestones">["status"],
  completedAt: string | null,
) {
  await admin
    .from("milestones")
    .update({
      status,
      completed_at: completedAt,
    })
    .eq("deal_id", dealId)
    .eq("audience", audience)
    .eq("key", key);
}

async function setDealState(
  admin: Awaited<ReturnType<typeof requireActor>>["admin"],
  dealId: string,
  state: Tables<"deals">["state"],
  extra: Record<string, unknown> = {},
) {
  const { data: current } = await admin.from("deals").select("paused, paused_reason").eq("id", dealId).maybeSingle();
  assertNotPaused(current ?? {});
  const { error } = await admin
    .from("deals")
    .update({ state, updated_at: new Date().toISOString(), ...extra })
    .eq("id", dealId);
  if (error) throw new DealActionError("validation", error.message);
}

async function focusedDealId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const snap = await getSnapshotAction();
  if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
  return snap.data.dealId;
}

export async function submitOfferAction(
  draft: OfferDraft,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    if ((actor.verification?.tier ?? 0) < 2) {
      return fail("tier_too_low", "Verification tier 2 is required to submit an offer.");
    }
    const { data: listing } = await actor.admin
      .from("listings")
      .select("*")
      .eq("id", draft.listingId)
      .maybeSingle();
    // listingId from the UI is the slug — look up via property payload
    let listingRow = listing;
    if (!listingRow) {
      const { data: properties } = await actor.admin.from("properties").select("*");
      const property = (properties ?? []).find((p) => {
        const extra =
          p.acris_payload && typeof p.acris_payload === "object" && !Array.isArray(p.acris_payload)
            ? (p.acris_payload as Record<string, unknown>)
            : {};
        return extra.slug === draft.listingId;
      });
      if (!property) throw new DealActionError("not_found", "Listing not found.");
      const { data: byProp } = await actor.admin
        .from("listings")
        .select("*")
        .eq("property_id", property.id)
        .maybeSingle();
      listingRow = byProp;
    }
    if (!listingRow) throw new DealActionError("not_found", "Listing not found.");
    if (listingRow.status !== "live") {
      throw new DealActionError("wrong_state", "Offers are only accepted on live listings.");
    }

    const { data: deal } = await actor.admin
      .from("deals")
      .select("*")
      .eq("listing_id", listingRow.id)
      .maybeSingle();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    assertNotPaused(deal);
    await assertAgencyDisclosure(actor.admin, deal.id, actor.userId);
    assertState(deal.state, ["live", "tours_offers"]);
    if (deal.state === "live") {
      await setDealState(actor.admin, deal.id, "tours_offers");
      await insertEvent(actor.admin, deal.id, actor.userId, "deal.tours_offers", {
        from: "live",
      });
    }

    if (!(draft.price > 0)) {
      return fail("validation", "Price must be greater than zero.");
    }
    if (draft.emd > draft.price) {
      return fail("validation", "Earnest money cannot exceed price.");
    }
    const today = new Date().toISOString().slice(0, 10);
    if (draft.closeDate < today) {
      return fail("validation", "Close date must be today or later.");
    }

    const scored = scoreOffer(draft);
    const { error: offerErr } = await actor.admin.from("offers").insert({
      deal_id: deal.id,
      buyer_id: actor.userId,
      status: "new",
      price_cents: dollarsToCents(draft.price),
      financing: financingToDb(draft.financing),
      down_pct: draft.downPercent,
      emd_cents: dollarsToCents(draft.emd),
      close_date: draft.closeDate,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      verified_funds: draft.verifiedFunds,
      certainty_label: scored.label,
      ai_note: null,
      contingencies: {
        inspection: draft.inspectionContingency,
        financing: draft.financingContingency,
        concessions: draft.concessions ?? 0,
        score: scored.score,
        buyer_label: actor.profile.full_name ?? "Buyer",
        has_agent: draft.agentAttached === true,
        verification_tier:
          draft.verificationTier ??
          (draft.financing === "Cash" && draft.verifiedFunds
            ? "cash_funds_verified"
            : draft.verifiedFunds
              ? "fully_underwritten"
              : "self_reported"),
      } satisfies Json,
    });
    if (offerErr) throw new DealActionError("validation", offerErr.message);

    await actor.admin.from("deal_parties").upsert(
      {
        deal_id: deal.id,
        user_id: actor.userId,
        role: "buyer",
        side: "buyer",
      },
      { onConflict: "deal_id,user_id,role" },
    );

    const { ensureDualAgencyConsentAction } = await import("@/lib/actions/documents");
    await ensureDualAgencyConsentAction(deal.id);

    await insertEvent(actor.admin, deal.id, actor.userId, "offer.submitted", {
      price_cents: dollarsToCents(draft.price),
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function acceptOfferAction(offerId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const dealId = await focusedDealId();
    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", dealId).single();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    assertNotPaused(deal);
    assertState(deal.state, ["tours_offers"]);
    const parties = await loadParties(actor.admin, dealId);
    assertParty(
      hasRole(parties, actor.userId, SELLER_OWNERS) || isStaff(actor),
      "Only the seller (or a broker on their behalf) may accept an offer.",
    );
    const offer = await resolveOffer(actor.admin, dealId, offerId);
    try {
      await assertDesignatedAgencyGate(actor.admin, dealId, parties, offer);
    } catch (error) {
      if (error instanceof DealActionError && error.code === "designated_agency_required") {
        const { insertApprovalRequest } = await import("@/lib/actions/approvals");
        await insertApprovalRequest(actor.admin, {
          dealId,
          kind: "designated_agency",
          requestedBy: actor.userId,
          context: { offer_id: offer.id },
        });
      }
      throw error;
    }
    const now = new Date().toISOString();

    await actor.admin.from("offers").update({ status: "accepted" }).eq("id", offer.id);
    await actor.admin
      .from("offers")
      .update({ status: "declined" })
      .eq("deal_id", dealId)
      .neq("id", offer.id)
      .in("status", [...OPEN_OFFER]);

    await setDealState(actor.admin, dealId, "accepted");
    await actor.admin
      .from("listings")
      .update({ status: "under_contract", updated_at: now })
      .eq("id", deal.listing_id);

    await stampMilestone(actor.admin, dealId, "buyer", "b3", "complete", now);
    await stampMilestone(actor.admin, dealId, "seller", "s5", "complete", now);

    const contractTasks = [
      { title: "Draft contract", description: "Attorneys circulate the contract of sale.", owner_role: "attorney_seller" },
      { title: "Attorney review", description: "Both sides review and mark up the contract.", owner_role: "attorney_buyer" },
      { title: "Execute contract", description: "Parties sign. Broker marks the contract executed.", owner_role: "broker_of_record" },
    ];
    await insertTaskRows(actor.admin, dealId, actor.userId, contractTasks);

    await insertEvent(actor.admin, dealId, actor.userId, "offer.accepted", { offer_id: offer.id });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function declineOfferAction(
  offerId: string,
  note?: string,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    const dealId = snap.data.dealId;
    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", dealId).single();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    assertNotPaused(deal);
    assertState(deal.state, ["tours_offers"]);
    const parties = await loadParties(actor.admin, dealId);
    assertParty(isSellerSide(parties, actor.userId) || isStaff(actor));
    const offer = await resolveOffer(actor.admin, dealId, offerId);
    await actor.admin.from("offers").update({ status: "declined" }).eq("id", offer.id);
    await insertEvent(actor.admin, dealId, actor.userId, "offer.declined", {
      offer_id: offer.id,
      note: note?.trim() || null,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function markOfferViewedAction(offerId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    const dealId = snap.data.dealId;
    const parties = await loadParties(actor.admin, dealId);
    assertParty(isSellerSide(parties, actor.userId) || isStaff(actor));
    const offer = await resolveOffer(actor.admin, dealId, offerId);
    if (offer.status === "new") {
      await actor.admin.from("offers").update({ status: "under_review" }).eq("id", offer.id);
      await insertEvent(actor.admin, dealId, actor.userId, "offer.viewed", { offer_id: offer.id });
    }
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function requestOfferExtensionAction(
  offerId: string,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    const dealId = snap.data.dealId;
    const parties = await loadParties(actor.admin, dealId);
    assertParty(isSellerSide(parties, actor.userId) || isStaff(actor));
    const offer = await resolveOffer(actor.admin, dealId, offerId);
    await insertTaskRows(actor.admin, dealId, actor.userId, [
      {
        title: "Request offer extension",
        description: `Seller asked to extend expiry on offer ${offer.id}. Coordination agent to chase the buyer.`,
        owner_role: "broker_of_record",
        status: "pending",
      },
    ]);
    await insertEvent(actor.admin, dealId, actor.userId, "offer.extension_requested", {
      offer_id: offer.id,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function counterOfferAction(
  offerId: string,
  changes: { price?: number; closeDate?: string; emd?: number },
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    const dealId = snap.data.dealId;
    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", dealId).single();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    assertNotPaused(deal);
    assertState(deal.state, ["tours_offers"]);
    const parties = await loadParties(actor.admin, dealId);
    assertParty(isSellerSide(parties, actor.userId) || isStaff(actor));
    const original = await resolveOffer(actor.admin, dealId, offerId);
    const extra =
      original.contingencies &&
      typeof original.contingencies === "object" &&
      !Array.isArray(original.contingencies)
        ? { ...(original.contingencies as Record<string, unknown>) }
        : {};
    extra.slug = typeof extra.slug === "string" ? `${extra.slug}-counter` : undefined;

    await actor.admin.from("offers").update({ status: "countered" }).eq("id", original.id);
    const { error } = await actor.admin.from("offers").insert({
      deal_id: dealId,
      buyer_id: original.buyer_id,
      status: "new",
      price_cents: changes.price != null ? dollarsToCents(changes.price) : original.price_cents,
      financing: original.financing,
      down_pct: original.down_pct,
      emd_cents: changes.emd != null ? dollarsToCents(changes.emd) : original.emd_cents,
      close_date: changes.closeDate ?? original.close_date,
      expires_at: original.expires_at,
      verified_funds: original.verified_funds,
      certainty_label: original.certainty_label,
      ai_note: original.ai_note,
      supersedes_id: original.id,
      contingencies: extra as Json,
    });
    if (error) throw new DealActionError("validation", error.message);
    await insertEvent(actor.admin, dealId, actor.userId, "offer.countered", {
      offer_id: original.id,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function markContractExecutedAction(dealIdArg?: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const dealId = await focusedDealId(dealIdArg);
    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", dealId).single();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    assertNotPaused(deal);
    assertState(deal.state, ["accepted"]);
    const parties = await loadParties(actor.admin, dealId);
    assertParty(
      hasRole(parties, actor.userId, CONTRACT_ROLES) || isStaff(actor),
      "Only the listing broker or seller's agent may mark the contract executed.",
    );
    const { data: dealFresh } = await actor.admin
      .from("deals")
      .select("contract_document_id")
      .eq("id", dealId)
      .single();
    await setDealState(actor.admin, dealId, "contract");
    await stampMilestone(actor.admin, dealId, "seller", "s6", "in_progress", null);
    await insertEvent(actor.admin, dealId, actor.userId, "contract.executed", {
      document_id: dealFresh?.contract_document_id ?? null,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

async function createDiligenceTasks(
  admin: Awaited<ReturnType<typeof requireActor>>["admin"],
  dealId: string,
) {
  const { data: existing } = await admin
    .from("tasks")
    .select("title")
    .eq("deal_id", dealId)
    .eq("auto", true);
  const titles = new Set((existing ?? []).map((t) => t.title));
  const rows = [
    {
      title: "Schedule inspection",
      description: "Book the property inspection and confirm access.",
      owner_role: "buyer",
    },
    {
      title: "Title order",
      description: "Order the title search. Exceptions land in Documents.",
      owner_role: "title",
    },
    {
      title: "Appraisal coordination",
      description: "Coordinate appraisal if the buyer is financing.",
      owner_role: "lender",
    },
  ].filter((t) => !titles.has(t.title));
  if (rows.length) {
    await insertTaskRows(admin, dealId, null, rows);
  }
}

export async function beginDiligenceAction(): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    const dealId = snap.data.dealId;
    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", dealId).single();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    assertState(deal.state, ["in_contract"]);
    assertParty(isStaff(actor), "Only a broker may begin diligence.");
    await setDealState(actor.admin, dealId, "diligence");
    await createDiligenceTasks(actor.admin, dealId);
    await stampMilestone(actor.admin, dealId, "buyer", "b5", "in_progress", null);
    await stampMilestone(actor.admin, dealId, "seller", "s7", "in_progress", null);
    await insertEvent(actor.admin, dealId, actor.userId, "diligence.begun", {});
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function confirmDepositAction(dealIdArg?: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const dealId = await focusedDealId(dealIdArg);
    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", dealId).single();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    assertNotPaused(deal);
    assertState(deal.state, ["contract"]);
    const parties = await loadParties(actor.admin, dealId);
    assertParty(
      hasRole(parties, actor.userId, CONTRACT_ROLES) || isStaff(actor),
      "Only the listing broker or seller's agent may confirm the deposit.",
    );
    const { data: accepted } = await actor.admin
      .from("offers")
      .select("*")
      .eq("deal_id", dealId)
      .eq("status", "accepted")
      .maybeSingle();
    await actor.admin.from("money_events").insert({
      deal_id: dealId,
      kind: "emd",
      amount_cents: accepted?.emd_cents ?? 0,
      status: "held",
      note: "Funds are held by the seller's attorney's escrow — the platform never holds them.",
    });
    await setDealState(actor.admin, dealId, "in_contract");
    await stampMilestone(actor.admin, dealId, "buyer", "b4", "complete", new Date().toISOString());
    await insertEvent(actor.admin, dealId, actor.userId, "deposit.confirmed", {
      amount_cents: accepted?.emd_cents ?? 0,
    });
    // Configured automatic: confirmDeposit advances into diligence.
    await setDealState(actor.admin, dealId, "diligence");
    await createDiligenceTasks(actor.admin, dealId);
    await stampMilestone(actor.admin, dealId, "buyer", "b5", "in_progress", null);
    await stampMilestone(actor.admin, dealId, "seller", "s7", "in_progress", null);
    await insertEvent(actor.admin, dealId, actor.userId, "diligence.begun", { automatic: true });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function completeTaskByTitleAction(title: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    const { data: tasks } = await actor.admin.from("tasks").select("*").eq("deal_id", snap.data.dealId);
    const task = (tasks ?? []).find((t) => t.title.toLowerCase() === title.toLowerCase());
    if (!task) throw new DealActionError("not_found", "Task not found.");
    return completeTaskAction(task.id);
  } catch (error) {
    return wrapError(error);
  }
}

export async function completeTaskAction(taskId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { data: task } = await actor.admin.from("tasks").select("*").eq("id", taskId).maybeSingle();
    if (!task) throw new DealActionError("not_found", "Task not found.");
    if (task.status === "done") throw new DealActionError("wrong_state", "Task is already done.");
    const parties = await loadParties(actor.admin, task.deal_id);
    const owns = task.owner_user_id === actor.userId || hasRole(parties, actor.userId, [task.owner_role as Tables<"deal_parties">["role"]]);
    assertParty(owns || isStaff(actor), "Only the task owner or a broker may complete this task.");
    await actor.admin
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", task.id);
    await insertEvent(actor.admin, task.deal_id, actor.userId, "task.completed", {
      task_id: task.id,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function advanceClearToCloseAction(): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    assertParty(isStaff(actor), "Only a broker may advance to clear to close.");
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    const dealId = snap.data.dealId;
    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", dealId).single();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    assertState(deal.state, ["diligence"]);
    const { data: tasks } = await actor.admin
      .from("tasks")
      .select("*")
      .eq("deal_id", dealId)
      .eq("auto", true)
      .in("title", ["Schedule inspection", "Title order", "Appraisal coordination"]);
    const unfinished = (tasks ?? []).filter((t) => t.status !== "done" && t.status !== "skipped");
    if (unfinished.length) {
      return fail("validation", "All required diligence tasks must be done first.");
    }
    await setDealState(actor.admin, dealId, "clear_to_close");
    await stampMilestone(actor.admin, dealId, "buyer", "b5", "complete", new Date().toISOString());
    await stampMilestone(actor.admin, dealId, "seller", "s7", "complete", new Date().toISOString());
    await insertEvent(actor.admin, dealId, actor.userId, "deal.clear_to_close", {});
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function markClosedAction(): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    assertParty(isStaff(actor), "Only a broker may mark a deal closed.");
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    const dealId = snap.data.dealId;
    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", dealId).single();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    assertState(deal.state, ["clear_to_close", "closing"]);
    const { data: accepted } = await actor.admin
      .from("offers")
      .select("*")
      .eq("deal_id", dealId)
      .eq("status", "accepted")
      .maybeSingle();
    const { data: listing } = await actor.admin
      .from("listings")
      .select("*")
      .eq("id", deal.listing_id)
      .single();
    const price = Number(accepted?.price_cents ?? listing?.price_cents ?? 0);
    const fee = Math.round(price * 0.01);
    await actor.admin.from("money_events").insert({
      deal_id: dealId,
      kind: "platform_fee",
      amount_cents: fee,
      status: "due",
      note: "1% REALORA fee",
    });
    const extra =
      accepted?.contingencies &&
      typeof accepted.contingencies === "object" &&
      !Array.isArray(accepted.contingencies)
        ? (accepted.contingencies as Record<string, unknown>)
        : {};
    const parties = await loadParties(actor.admin, dealId);
    const hadAgent = extra.has_agent === true || parties.some((p) => p.role === "agent_buyer");
    if (listing?.buyer_agent_offered && hadAgent) {
      await actor.admin.from("money_events").insert({
        deal_id: dealId,
        kind: "buyer_agent_fee",
        amount_cents: fee,
        status: "due",
        note: "+1% buyer-agent amount",
      });
    }
    await setDealState(actor.admin, dealId, "post_close");
    await actor.admin
      .from("listings")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", deal.listing_id);
    await insertEvent(actor.admin, dealId, actor.userId, "deal.closed", { fee_cents: fee });
    const { generateClosingFeeInvoice } = await import("@/lib/actions/vendor");
    await generateClosingFeeInvoice(actor, deal, listing, accepted, fee, hadAgent);
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function markFellThroughAction(reason: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const allowed = [
      "financing",
      "inspection",
      "title",
      "board",
      "cold_feet",
      "attorney_advice",
      "other",
    ];
    if (!allowed.includes(reason)) {
      return fail("validation", "A valid fell-through reason is required.");
    }
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    const dealId = snap.data.dealId;
    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", dealId).single();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    if (TERMINAL.includes(deal.state)) {
      throw new DealActionError("wrong_state", "Deal is already terminal.");
    }
    const parties = await loadParties(actor.admin, dealId);
    assertParty(isSellerSide(parties, actor.userId) || isStaff(actor));
    await setDealState(actor.admin, dealId, "fell_through", { fell_through_reason: reason });
    await insertEvent(actor.admin, dealId, actor.userId, "deal.fell_through", { reason });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function sendMessageAction(
  threadKey: string,
  body: string,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    const dealId = snap.data.dealId;
    const parties = await loadParties(actor.admin, dealId);
    assertParty(isStaff(actor) || parties.some((p) => p.user_id === actor.userId));
    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", dealId).single();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    assertNotPaused(deal);
    if (!body.trim()) return fail("validation", "Message cannot be empty.");
    const buyerParty = parties.some((p) => p.user_id === actor.userId && p.side === "buyer");
    if (buyerParty && isProductionDataMode()) {
      const { data: prior } = await actor.admin
        .from("messages")
        .select("id")
        .eq("deal_id", dealId)
        .eq("sender_id", actor.userId)
        .limit(1);
      if (!prior?.length) {
        await assertAgencyDisclosure(actor.admin, dealId, actor.userId);
      }
    }
    const { error } = await actor.admin.from("messages").insert({
      deal_id: dealId,
      thread_key: threadKey,
      sender_id: actor.userId,
      body: body.trim(),
    });
    if (error) throw new DealActionError("validation", error.message);
    await insertEvent(actor.admin, dealId, actor.userId, "message.sent", { thread_key: threadKey });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function updateListingAction(
  ...args: Parameters<typeof import("@/lib/actions/listing").updateListingAction>
) {
  const { updateListingAction: inner } = await import("@/lib/actions/listing");
  return inner(...args);
}

export async function verifyCurrentUserAction(
  kind: "id" | "ownership",
): Promise<ActionResult<AppSnapshot>> {
  try {
    const { startVerificationAction } = await import("@/lib/actions/verification");
    const started = await startVerificationAction(kind);
    if (!started.ok) return started;
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function setIntentAction(
  intent: "buying" | "selling" | "both",
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    await actor.admin.from("profiles").update({ intent }).eq("id", actor.userId);
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function bookVendorAction(
  vendorId: string,
  date: string,
  time: string,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const { startVendorBookingAction } = await import("@/lib/actions/vendor");
    const started = await startVendorBookingAction(vendorId, date, time);
    if (!started.ok) return started;
    if (started.data.blocked) {
      return fail("validation", started.data.blocked);
    }
    return { ok: true, data: started.data.snapshot };
  } catch (error) {
    return wrapError(error);
  }
}

export async function uploadDocumentAction(
  name: string,
  group: string,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    await actor.admin.from("documents").insert({
      deal_id: snap.data.dealId,
      uploader_id: actor.userId,
      name,
      kind: group,
      status: "Pending",
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}
