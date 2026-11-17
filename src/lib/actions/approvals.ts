"use server";

import {
  insertEvent,
  isStaff,
  loadParties,
  requireActor,
  type Actor,
} from "@/lib/actions/actor";
import { DealActionError, fail, wrapError, type ActionResult } from "@/lib/actions/errors";
import { getSnapshotAction, type AppSnapshot } from "@/lib/actions/snapshot";
import { assignedAgents, designatedConsentsSigned } from "@/lib/compliance/gates";
import type { Json, Tables } from "@/lib/database.types";

export type ApprovalKind = Tables<"approvals">["kind"];
export type ApprovalStatus = Tables<"approvals">["status"];

const KINDS: ApprovalKind[] = [
  "contract_execution",
  "deposit_confirmation",
  "designated_agency",
  "listing_publish",
  "verification_review",
  "extraction_confirmation",
  "listing_agreement_countersign",
];

async function fresh(): Promise<ActionResult<AppSnapshot>> {
  return getSnapshotAction();
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function requireBroker(actor: Actor) {
  if (!isStaff(actor)) {
    throw new DealActionError("forbidden", "Broker of record only.");
  }
}

export async function insertApprovalRequest(
  admin: Actor["admin"],
  input: {
    dealId: string;
    kind: ApprovalKind;
    requestedBy: string | null;
    context?: Record<string, unknown>;
  },
): Promise<Tables<"approvals">> {
  if (!KINDS.includes(input.kind)) {
    throw new DealActionError("validation", `Unknown approval kind ${input.kind}.`);
  }
  const { data: open } = await admin
    .from("approvals")
    .select("*")
    .eq("deal_id", input.dealId)
    .eq("kind", input.kind)
    .eq("status", "pending")
    .maybeSingle();
  if (open) return open;
  const { data, error } = await admin
    .from("approvals")
    .insert({
      deal_id: input.dealId,
      kind: input.kind,
      status: "pending",
      context: (input.context ?? {}) as Json,
      requested_by: input.requestedBy,
    })
    .select("*")
    .single();
  if (error || !data) throw new DealActionError("validation", error?.message ?? "Could not create approval.");
  await insertEvent(admin, input.dealId, input.requestedBy, "broker.approval.requested", {
    approval_id: data.id,
    kind: input.kind,
  });
  return data;
}

export async function requestApprovalAction(
  dealId: string,
  kind: ApprovalKind,
  context: Record<string, unknown> = {},
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const parties = await loadParties(actor.admin, dealId);
    const canRequest =
      isStaff(actor) ||
      parties.some(
        (p) =>
          p.user_id === actor.userId &&
          ["agent_seller", "agent_buyer", "broker_of_record", "seller", "buyer"].includes(p.role),
      );
    if (!canRequest) throw new DealActionError("forbidden", "You cannot request this approval.");
    await insertApprovalRequest(actor.admin, {
      dealId,
      kind,
      requestedBy: actor.userId,
      context,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

async function executeApproved(actor: Actor, approval: Tables<"approvals">) {
  const ctx = asRecord(approval.context);
  if (approval.kind === "deposit_confirmation") {
    const { confirmDepositAction } = await import("@/lib/actions/deal");
    const result = await confirmDepositAction(approval.deal_id);
    if (!result.ok) throw new DealActionError(result.code, result.message);
    return;
  }
  if (approval.kind === "contract_execution") {
    const { markContractExecutedAction } = await import("@/lib/actions/deal");
    const result = await markContractExecutedAction(approval.deal_id);
    if (!result.ok) throw new DealActionError(result.code, result.message);
    return;
  }
  if (approval.kind === "listing_publish") {
    const listingId =
      typeof ctx.listing_id === "string"
        ? ctx.listing_id
        : typeof ctx.listingId === "string"
          ? ctx.listingId
          : null;
    if (!listingId) throw new DealActionError("validation", "listing_publish requires listing_id.");
    const { publishListingAction } = await import("@/lib/actions/listing");
    const result = await publishListingAction(listingId);
    if (!result.ok) throw new DealActionError(result.code, result.message);
    return;
  }
  if (approval.kind === "designated_agency") {
    const { agentSeller, agentBuyer } = assignedAgents(approval);
    if (!agentSeller || !agentBuyer) {
      throw new DealActionError("validation", "Assign agent_seller and agent_buyer.");
    }
    if (agentSeller === agentBuyer) {
      throw new DealActionError("validation", "Designated agents must be two different users.");
    }
    const now = new Date().toISOString();
    await actor.admin.from("deal_parties").upsert(
      {
        deal_id: approval.deal_id,
        user_id: agentSeller,
        role: "agent_seller",
        side: "seller",
      },
      { onConflict: "deal_id,user_id,role" },
    );
    await actor.admin.from("deal_parties").upsert(
      {
        deal_id: approval.deal_id,
        user_id: agentBuyer,
        role: "agent_buyer",
        side: "buyer",
      },
      { onConflict: "deal_id,user_id,role" },
    );
    await insertEvent(actor.admin, approval.deal_id, actor.userId, "deal.designated_agents_assigned", {
      agent_seller: agentSeller,
      agent_buyer: agentBuyer,
      at: now,
    });
    return;
  }
  if (approval.kind === "verification_review") {
    const userId = typeof ctx.user_id === "string" ? ctx.user_id : null;
    if (userId) {
      const { recomputeVerification } = await import("@/lib/services/verification-persona");
      await recomputeVerification(userId, {
        id_status: "verified",
        method: "broker_review",
        verified_at: new Date().toISOString(),
      });
    }
    return;
  }
  if (approval.kind === "extraction_confirmation") {
    const documentId = typeof ctx.document_id === "string" ? ctx.document_id : null;
    if (!documentId) throw new DealActionError("validation", "extraction_confirmation requires document_id.");
    const { data: doc } = await actor.admin.from("documents").select("*").eq("id", documentId).maybeSingle();
    if (!doc) throw new DealActionError("not_found", "Document not found.");
    const extra = asRecord(doc.extracted);
    const proposed = extra.proposed;
    if (!proposed || typeof proposed !== "object") {
      throw new DealActionError("validation", "No extraction proposal to confirm.");
    }
    const { confirmExtractionAction } = await import("@/lib/actions/documents");
    const result = await confirmExtractionAction(
      documentId,
      proposed as import("@/lib/services/extraction-types").ContractExtraction,
    );
    if (!result.ok) throw new DealActionError(result.code, result.message);
  }
  // listing_agreement_countersign — approve only after native countersign advances
  // the document to Fully executed; deciding here without signing is a no-op.
}

export async function decideApprovalAction(
  approvalId: string,
  decision: "approved" | "rejected" | "changes_requested",
  input: { note?: string; context?: Record<string, unknown> } = {},
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    requireBroker(actor);
    const { data: approval } = await actor.admin
      .from("approvals")
      .select("*")
      .eq("id", approvalId)
      .maybeSingle();
    if (!approval) throw new DealActionError("not_found", "Approval not found.");
    if (approval.status !== "pending" && approval.status !== "changes_requested") {
      throw new DealActionError("wrong_state", "This approval is already decided.");
    }

    const mergedContext = { ...asRecord(approval.context), ...(input.context ?? {}) };
    if (decision === "approved" && approval.kind === "designated_agency") {
      const { agentSeller, agentBuyer } = assignedAgents({
        ...approval,
        context: mergedContext as Json,
      });
      if (!agentSeller || !agentBuyer) {
        return fail("validation", "Assign two different users as agent_seller and agent_buyer.");
      }
      if (agentSeller === agentBuyer) {
        return fail("validation", "Designated agents must be two different users.");
      }
      const consents = await designatedConsentsSigned(actor.admin, approval.deal_id);
      if (!consents.seller || !consents.buyer) {
        return fail(
          "designated_agency_required",
          "Seller and buyer designated-agency consents must be signed before approval.",
        );
      }
    }

    const now = new Date().toISOString();
    const { error } = await actor.admin
      .from("approvals")
      .update({
        status: decision,
        decided_by: actor.userId,
        decided_at: now,
        note: input.note ?? null,
        context: mergedContext as Json,
      })
      .eq("id", approvalId);
    if (error) throw new DealActionError("validation", error.message);

    const eventType =
      decision === "approved"
        ? "broker.approval.approved"
        : decision === "rejected"
          ? "broker.approval.rejected"
          : "broker.approval.changes_requested";
    await insertEvent(actor.admin, approval.deal_id, actor.userId, eventType, {
      approval_id: approvalId,
      kind: approval.kind,
      note: input.note ?? null,
    });

    if (decision === "approved") {
      await executeApproved(actor, {
        ...approval,
        status: "approved",
        context: mergedContext as Json,
        decided_by: actor.userId,
        decided_at: now,
        note: input.note ?? null,
      });
    }
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}
