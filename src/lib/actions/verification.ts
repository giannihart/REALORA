"use server";

import {
  insertEvent,
  insertTaskRows,
  isStaff,
  loadParties,
  requireActor,
} from "@/lib/actions/actor";
import { DealActionError, fail, wrapError, type ActionResult } from "@/lib/actions/errors";
import { getSnapshotAction, type AppSnapshot } from "@/lib/actions/snapshot";
import {
  createPersonaInquiry,
  personaConfigured,
  recomputeVerification,
} from "@/lib/services/verification-persona";
import { namesMatch, ownersFromAcris } from "@/lib/verification/ownership";
import { personaConfigured as personaOn, siteUrl } from "@/lib/site";
import { isProductionDataMode, mocksAllowed } from "@/lib/data/mode";
import { financingFromDb } from "@/lib/data/map";
import { deriveVerificationTier } from "@/lib/offers";
import type { Json } from "@/lib/database.types";

async function fresh(): Promise<ActionResult<AppSnapshot>> {
  return getSnapshotAction();
}

export async function getPlatformConfigAction(): Promise<
  ActionResult<{
    verification: "persona" | "test" | "unavailable";
    stripe: boolean;
    notifyEmail: boolean;
    notifySms: boolean;
  }>
> {
  try {
    return {
      ok: true,
      data: {
        verification: personaOn() ? "persona" : mocksAllowed() ? "test" : "unavailable",
        stripe: Boolean(process.env.STRIPE_SECRET_KEY),
        notifyEmail: Boolean(process.env.RESEND_API_KEY),
        notifySms: Boolean(
          process.env.TWILIO_ACCOUNT_SID &&
            process.env.TWILIO_AUTH_TOKEN &&
            process.env.TWILIO_FROM_NUMBER,
        ),
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}

export async function startVerificationAction(
  kind: "id" | "ownership",
): Promise<ActionResult<{ hostedUrl?: string; mode: "persona" | "test"; snapshot: AppSnapshot }>> {
  try {
    const actor = await requireActor();
    if (kind === "id") {
      if (!personaConfigured() && isProductionDataMode()) {
        return fail("unavailable", "Identity verification is unavailable until the provider is configured.");
      }
      if (personaConfigured()) {
        const inquiry = await createPersonaInquiry(actor.userId);
        await insertEventForUser(actor, "verification.persona_started", {
          inquiry_id: inquiry.inquiryId,
        });
        const snap = await fresh();
        return {
          ok: true,
          data: {
            hostedUrl: inquiry.hostedUrl,
            mode: "persona",
            snapshot: snap.ok ? snap.data : ({} as AppSnapshot),
          },
        };
      }
      await recomputeVerification(actor.userId, {
        id_status: "verified",
        funds_status: actor.verification?.funds_status ?? "pending",
        method: "test_verification",
        verified_at: new Date().toISOString(),
      });
      await insertEventForUser(actor, "verification.test_id", { mode: "test" });
      const snap = await fresh();
      return {
        ok: true,
        data: { mode: "test", snapshot: snap.ok ? snap.data : ({} as AppSnapshot) },
      };
    }

    await runSellerOwnershipCheck(actor.userId);
    const snap = await fresh();
    return {
      ok: true,
      data: {
        mode: personaConfigured() ? "persona" : "test",
        snapshot: snap.ok ? snap.data : ({} as AppSnapshot),
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}

async function insertEventForUser(
  actor: Awaited<ReturnType<typeof requireActor>>,
  type: string,
  payload: Record<string, unknown>,
) {
  const { data: parties } = await actor.admin
    .from("deal_parties")
    .select("deal_id")
    .eq("user_id", actor.userId)
    .limit(1);
  const dealId = parties?.[0]?.deal_id;
  if (!dealId) return;
  await insertEvent(actor.admin, dealId, actor.userId, type, payload);
}

export async function runSellerOwnershipCheck(userId: string): Promise<{
  path: "auto" | "ae_review" | "no_listing";
}> {
  const { requireActor: req } = await import("@/lib/actions/actor");
  let actor: Awaited<ReturnType<typeof req>>;
  try {
    actor = await req();
  } catch {
    throw new DealActionError("unauthenticated", "Sign in required.");
  }
  if (actor.userId !== userId) {
    throw new DealActionError("forbidden", "Ownership check is for the signed-in seller.");
  }
  if (!personaConfigured() && actor.verification?.id_status !== "approved" && actor.verification?.id_status !== "verified") {
    await recomputeVerification(userId, {
      id_status: "verified",
      method: "test_verification",
    });
  }

  const { data: listings } = await actor.admin.from("listings").select("*").eq("seller_id", userId);
  const listing = (listings ?? [])[0];
  if (!listing) {
    await insertEventForUser(actor, "verification.ownership_no_listing", {});
    return { path: "no_listing" };
  }
  const { data: property } = await actor.admin
    .from("properties")
    .select("*")
    .eq("id", listing.property_id)
    .maybeSingle();
  const owners = ownersFromAcris((property?.acris_payload ?? null) as Json);
  const name = actor.profile.full_name ?? "";
  const matched = namesMatch(name, owners);
  const { data: deal } = await actor.admin
    .from("deals")
    .select("id")
    .eq("listing_id", listing.id)
    .maybeSingle();

  if (matched) {
    await recomputeVerification(userId, {
      method: "ownership_verified",
      verified_at: new Date().toISOString(),
    });
    if (deal) {
      await insertEvent(actor.admin, deal.id, userId, "verification.ownership_auto", {
        name,
        owners,
        path: "auto",
      });
    }
    return { path: "auto" };
  }

  if (deal) {
    await insertTaskRows(actor.admin, deal.id, userId, [
      {
        title: "Review seller ownership",
        description: `ACRIS owners of record: ${owners.join(", ") || "(none)"}. Profile name: ${name || "(none)"}. Trusts, LLCs, and estates are expected in Brooklyn — review and approve or reject.`,
        owner_role: "broker_of_record",
        auto: false,
      },
    ]);
    await actor.admin.from("documents").insert({
      deal_id: deal.id,
      uploader_id: userId,
      name: "ACRIS owners of record",
      kind: "Title",
      status: "For review",
      visibility: "seller_side",
      extracted: { ownersOfRecord: owners, profileName: name } as unknown as Json,
    });
    await insertEvent(actor.admin, deal.id, userId, "verification.ownership_ae_review", {
      name,
      owners,
      path: "ae_review",
    });
  }
  return { path: "ae_review" };
}

async function assertAeOrStaff(userIdForAuthz: string) {
  const actor = await requireActor();
  if (isStaff(actor)) return actor;
  const snap = await getSnapshotAction();
  const dealId = snap.ok ? snap.data.dealId : null;
  if (!dealId) throw new DealActionError("forbidden", "Only a broker may confirm financing documents.");
  const parties = await loadParties(actor.admin, dealId);
  const ae = parties.some(
    (p) => p.user_id === actor.userId && (p.role === "agent_seller" || p.role === "broker_of_record"),
  );
  if (!ae) {
    throw new DealActionError("forbidden", "Only a broker or AE may confirm financing documents.");
  }
  void userIdForAuthz;
  return actor;
}

/** Sync verified_funds + derived tier onto every offer owned by this buyer. */
async function syncBuyerOfferVerification(
  admin: Awaited<ReturnType<typeof requireActor>>["admin"],
  buyerUserId: string,
) {
  const { data: offers } = await admin.from("offers").select("*").eq("buyer_id", buyerUserId);
  for (const row of offers ?? []) {
    const financing = financingFromDb(row.financing);
    const extra =
      row.contingencies && typeof row.contingencies === "object" && !Array.isArray(row.contingencies)
        ? { ...(row.contingencies as Record<string, unknown>) }
        : {};
    delete extra.verification_tier;
    const tier = deriveVerificationTier(financing, true, null);
    extra.verification_tier = tier;
    await admin
      .from("offers")
      .update({
        verified_funds: true,
        contingencies: extra as Json,
      })
      .eq("id", row.id);
  }
}

export async function confirmFundsAction(userId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await assertAeOrStaff(userId);
    const { data: proof } = await actor.admin
      .from("documents")
      .select("id")
      .eq("uploader_id", userId)
      .or("kind.eq.proof_of_funds,name.ilike.%proof of funds%")
      .limit(1)
      .maybeSingle();
    void proof;
    await recomputeVerification(userId, {
      funds_status: "verified",
      verified_at: new Date().toISOString(),
    });
    await syncBuyerOfferVerification(actor.admin, userId);
    const { data: parties } = await actor.admin
      .from("deal_parties")
      .select("deal_id")
      .eq("user_id", userId)
      .eq("role", "buyer")
      .limit(1);
    if (parties?.[0]) {
      await insertEvent(actor.admin, parties[0].deal_id, actor.userId, "verification.funds_confirmed", {
        user_id: userId,
      });
    }
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

/**
 * AE/staff confirm a pre-approval letter. Path-separated from cash funds:
 * writes preapproval_* fields only — never funds_status.
 */
export async function confirmPreApprovalDocsAction(
  userId: string,
  input: {
    approvedAmountCents: number;
    lenderName: string;
    confirmedAt?: string;
  },
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await assertAeOrStaff(userId);
    if (!(input.approvedAmountCents > 0)) {
      throw new DealActionError("validation", "Enter the approved amount from the letter.");
    }
    if (!input.lenderName.trim()) {
      throw new DealActionError("validation", "Enter the lender name from the letter.");
    }
    const { data: letter } = await actor.admin
      .from("documents")
      .select("id")
      .eq("uploader_id", userId)
      .or("kind.eq.pre_approval,name.ilike.%pre-approval%,name.ilike.%preapproval%")
      .limit(1)
      .maybeSingle();
    void letter;
    const confirmedAt = input.confirmedAt?.trim() || new Date().toISOString();
    await recomputeVerification(userId, {
      preapproval_status: "verified",
      approved_amount_cents: Math.round(input.approvedAmountCents),
      lender_name: input.lenderName.trim(),
      preapproval_confirmed_at: confirmedAt,
      method: "preapproval_ae_confirmed",
      // Do not write funds_status — cash path stays distinct.
    });
    await syncBuyerOfferVerification(actor.admin, userId);
    const { data: parties } = await actor.admin
      .from("deal_parties")
      .select("deal_id")
      .eq("user_id", userId)
      .eq("role", "buyer")
      .limit(1);
    if (parties?.[0]) {
      await insertEvent(
        actor.admin,
        parties[0].deal_id,
        actor.userId,
        "verification.preapproval_docs_confirmed",
        {
          user_id: userId,
          approved_amount_cents: Math.round(input.approvedAmountCents),
          lender_name: input.lenderName.trim(),
          confirmed_at: confirmedAt,
        },
      );
    } else {
      await insertEvent(actor.admin, null, actor.userId, "verification.preapproval_docs_confirmed", {
        user_id: userId,
        approved_amount_cents: Math.round(input.approvedAmountCents),
        lender_name: input.lenderName.trim(),
        confirmed_at: confirmedAt,
      });
    }
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

/** Pending pre-approval letters for broker AE confirm queue. */
export async function listPendingPreapprovalConfirmationsAction(): Promise<
  ActionResult<
    {
      userId: string;
      name: string;
      email: string | null;
      documentId: string;
      documentName: string;
      packetLenderName: string | null;
    }[]
  >
> {
  try {
    const actor = await requireActor();
    if (!isStaff(actor)) {
      throw new DealActionError("forbidden", "Only staff may review pre-approval letters.");
    }
    const { data: docs, error } = await actor.admin
      .from("documents")
      .select("id, name, uploader_id, kind, created_at")
      .or("kind.eq.pre_approval,name.ilike.%pre-approval%,name.ilike.%preapproval%")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new DealActionError("validation", error.message);

    const uploaderIds = [
      ...new Set((docs ?? []).map((d) => d.uploader_id).filter(Boolean)),
    ] as string[];
    if (!uploaderIds.length) return { ok: true, data: [] };

    const { data: verifications } = await actor.admin
      .from("verifications")
      .select("user_id, preapproval_status")
      .in("user_id", uploaderIds);
    const verified = new Set(
      (verifications ?? [])
        .filter((v) => v.preapproval_status === "verified")
        .map((v) => v.user_id),
    );

    const pendingDocs = (docs ?? []).filter(
      (d) => d.uploader_id && !verified.has(d.uploader_id),
    );
    const pendingUserIds = [
      ...new Set(pendingDocs.map((d) => d.uploader_id!).filter(Boolean)),
    ];
    const { data: profiles } = await actor.admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", pendingUserIds);
    const { data: packets, error: packetsErr } = await actor.admin
      .from("lender_packets")
      .select("user_id, lender_name")
      .in("user_id", pendingUserIds);
    if (
      packetsErr &&
      !(
        /lender_packets/i.test(packetsErr.message) &&
        /(schema cache|could not find the table|does not exist)/i.test(packetsErr.message)
      )
    ) {
      throw new DealActionError("validation", packetsErr.message);
    }

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const packetByUser = new Map((packets ?? []).map((p) => [p.user_id, p]));
    const seen = new Set<string>();
    const rows = [];
    for (const doc of pendingDocs) {
      const uid = doc.uploader_id!;
      if (seen.has(uid)) continue;
      seen.add(uid);
      const profile = profileById.get(uid);
      rows.push({
        userId: uid,
        name: profile?.full_name ?? "Buyer",
        email: profile?.email ?? null,
        documentId: doc.id,
        documentName: doc.name,
        packetLenderName: packetByUser.get(uid)?.lender_name ?? null,
      });
    }
    return { ok: true, data: rows };
  } catch (error) {
    return wrapError(error);
  }
}

export async function resolveOwnershipReviewAction(
  taskId: string,
  approve: boolean,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    if (!isStaff(actor)) {
      throw new DealActionError("forbidden", "Only a broker may resolve ownership review.");
    }
    const { data: task } = await actor.admin.from("tasks").select("*").eq("id", taskId).maybeSingle();
    if (!task) throw new DealActionError("not_found", "Task not found.");
    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", task.deal_id).single();
    const { data: listing } = deal
      ? await actor.admin.from("listings").select("*").eq("id", deal.listing_id).maybeSingle()
      : { data: null };
    const sellerId = listing?.seller_id;
    if (!sellerId) throw new DealActionError("not_found", "Seller not found.");
    await actor.admin
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", task.id);
    if (approve) {
      await recomputeVerification(sellerId, {
        method: "ownership_ae_approved",
        verified_at: new Date().toISOString(),
      });
    } else {
      await recomputeVerification(sellerId, { method: "ownership_ae_rejected" });
    }
    await insertEvent(actor.admin, task.deal_id, actor.userId, "verification.ownership_ae_resolved", {
      approved: approve,
      path: approve ? "ae_approved" : "ae_rejected",
      seller_id: sellerId,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

void fail;
void siteUrl;
