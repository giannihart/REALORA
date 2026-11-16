"use server";

import { requireActor } from "@/lib/actions/actor";
import { wrapError, type ActionResult } from "@/lib/actions/errors";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

export type IntakeAgreementHoldReason = "identity" | "signing_unavailable";

/**
 * Platform-facing signal when a seller reaches the agreement step but cannot
 * sign yet (brokerage identity missing, or e-sign provider unavailable).
 * Creates visible AE work via the notifications log — no portal door.
 */
export async function reportIntakeAgreementHoldAction(input: {
  reason: IntakeAgreementHoldReason;
  address: string;
}): Promise<ActionResult<{ reported: true }>> {
  try {
    const admin = createServiceRoleClient();
    let sellerUserId: string | null = null;
    let sellerEmail: string | null = null;
    try {
      const actor = await requireActor();
      sellerUserId = actor.userId;
      sellerEmail = actor.email;
    } catch {
      /* hold can fire before auth */
    }

    const payload = {
      reason: input.reason,
      address: input.address,
      seller_user_id: sellerUserId,
      seller_email: sellerEmail,
      at: new Date().toISOString(),
    } as Json;

    const { data: staff } = await admin
      .from("profiles")
      .select("id")
      .in("app_role", ["broker", "admin"]);

    for (const row of staff ?? []) {
      await admin.from("notifications").insert({
        user_id: row.id,
        deal_id: null,
        channel: "log",
        template_key: "intake.agreement_waiting",
        payload,
        status: "logged_only",
      });
    }

    if (sellerUserId) {
      await admin.from("notifications").insert({
        user_id: sellerUserId,
        deal_id: null,
        channel: "log",
        template_key: "intake.agreement_waiting.seller",
        payload,
        status: "logged_only",
      });
    }

    return { ok: true, data: { reported: true } };
  } catch (error) {
    return wrapError(error);
  }
}

/**
 * When brokerage identity becomes renderable, notify sellers who were waiting
 * on the agreement hold so they can resume at signing.
 */
export async function notifyWaitingIntakeSellersAction(): Promise<
  ActionResult<{ notified: number }>
> {
  try {
    const admin = createServiceRoleClient();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: waits } = await admin
      .from("notifications")
      .select("user_id, payload, created_at")
      .eq("template_key", "intake.agreement_waiting.seller")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    const seen = new Set<string>();
    let notified = 0;
    for (const row of waits ?? []) {
      const uid = row.user_id;
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const { data: already } = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", uid)
        .eq("template_key", "intake.agreement_ready")
        .gte("created_at", row.created_at)
        .limit(1)
        .maybeSingle();
      if (already) continue;
      const address =
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? String((row.payload as Record<string, unknown>).address ?? "")
          : "";
      await admin.from("notifications").insert({
        user_id: uid,
        deal_id: null,
        channel: "log",
        template_key: "intake.agreement_ready",
        payload: {
          address,
          resume: "/sell?resume=1",
          at: new Date().toISOString(),
        } as Json,
        status: "logged_only",
      });
      notified += 1;
    }
    return { ok: true, data: { notified } };
  } catch (error) {
    return wrapError(error);
  }
}
