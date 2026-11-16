"use server";

import { insertEvent, requireActor } from "@/lib/actions/actor";
import { DealActionError, wrapError, type ActionResult } from "@/lib/actions/errors";
import { getSnapshotAction } from "@/lib/actions/snapshot";
import type { VendorCategory } from "@/lib/types";

export async function recordServiceProviderChosenAction(
  category: VendorCategory,
  vendorId: string,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = await requireActor();
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) {
      throw new DealActionError("not_found", "Deal not found.");
    }
    await insertEvent(actor.admin, snap.data.dealId, actor.userId, "service.provider_chosen", {
      category,
      vendor_id: vendorId,
    });
    return { ok: true, data: { ok: true } };
  } catch (error) {
    return wrapError(error);
  }
}

export async function recordOwnProviderAction(
  category: VendorCategory,
  input: import("@/lib/types").OwnProviderDetails,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = await requireActor();
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) {
      throw new DealActionError("not_found", "Deal not found.");
    }
    await insertEvent(actor.admin, snap.data.dealId, actor.userId, "service.own_provider_added", {
      category,
      name: input.name,
      contact: input.contact,
      note: input.note ?? null,
      quotedPrice: input.quotedPrice ?? null,
    });
    return { ok: true, data: { ok: true } };
  } catch (error) {
    return wrapError(error);
  }
}

export async function recordServiceCompletedAction(
  category: VendorCategory,
  outcome: string,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = await requireActor();
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) {
      throw new DealActionError("not_found", "Deal not found.");
    }
    await insertEvent(actor.admin, snap.data.dealId, actor.userId, "service.completed", {
      category,
      outcome,
    });
    return { ok: true, data: { ok: true } };
  } catch (error) {
    return wrapError(error);
  }
}
