"use server";

import { requireActor } from "@/lib/actions/actor";
import { wrapError, type ActionResult } from "@/lib/actions/errors";
import { getSnapshotAction, type AppSnapshot } from "@/lib/actions/snapshot";
import { mergeFinancingPathPrefs } from "@/lib/buyer-prefs";
import type { FinancingPath } from "@/lib/types";

export async function setFinancingPathAction(
  path: FinancingPath,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { data: profile } = await actor.admin
      .from("profiles")
      .select("notification_prefs")
      .eq("id", actor.userId)
      .maybeSingle();
    await actor.admin
      .from("profiles")
      .update({
        notification_prefs: mergeFinancingPathPrefs(
          profile?.notification_prefs ?? null,
          path,
        ),
      })
      .eq("id", actor.userId);
    return getSnapshotAction();
  } catch (error) {
    return wrapError(error);
  }
}
