"use server";

import { createHash, randomBytes } from "node:crypto";
import {
  assertParty,
  hasRole,
  insertEvent,
  isSellerSide,
  isStaff,
  loadParties,
  requireActor,
} from "@/lib/actions/actor";
import { DealActionError, fail, wrapError, type ActionResult } from "@/lib/actions/errors";
import { getSnapshotAction, type AppSnapshot } from "@/lib/actions/snapshot";
import { siteUrl } from "@/lib/site";
import type { Tables } from "@/lib/database.types";
import { INVITE_ROLES, sideForInviteRole, type InviteRole } from "@/lib/invite-roles";

const SELLER_INVITE_ROLES: InviteRole[] = ["attorney_seller", "title", "vendor"];
const BUYER_INVITE_ROLES: InviteRole[] = ["attorney_buyer", "lender", "inspector", "vendor"];

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function canInvite(
  actor: Awaited<ReturnType<typeof requireActor>>,
  parties: Tables<"deal_parties">[],
  role: InviteRole,
): boolean {
  if (isStaff(actor) || hasRole(parties, actor.userId, ["broker_of_record", "agent_seller"])) {
    return true;
  }
  if (isSellerSide(parties, actor.userId) && SELLER_INVITE_ROLES.includes(role)) return true;
  const buyerSide = parties.some((p) => p.user_id === actor.userId && p.side === "buyer");
  if (buyerSide && BUYER_INVITE_ROLES.includes(role)) return true;
  return false;
}

async function fresh(): Promise<ActionResult<AppSnapshot>> {
  return getSnapshotAction();
}

export async function invitePartyAction(
  dealId: string,
  email: string,
  role: InviteRole,
  side?: Tables<"deal_parties">["side"],
): Promise<ActionResult<{ url: string; expiresAt: string; snapshot: AppSnapshot }>> {
  try {
    const actor = await requireActor();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      return fail("validation", "A valid email is required.");
    }
    if (!INVITE_ROLES.includes(role)) {
      return fail("validation", "That role cannot be invited.");
    }
    const { data: deal } = await actor.admin.from("deals").select("id").eq("id", dealId).maybeSingle();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    const parties = await loadParties(actor.admin, dealId);
    assertParty(
      canInvite(actor, parties, role),
      "You cannot invite that role on this deal.",
    );
    const boundSide = side ?? sideForInviteRole(role);
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

    const { data: open } = await actor.admin
      .from("invites")
      .select("*")
      .eq("deal_id", dealId)
      .eq("role", role)
      .is("accepted_at", null);
    const existing = (open ?? []).find((row) => row.email.toLowerCase() === normalized);
    if (existing) {
      await actor.admin
        .from("invites")
        .update({
          token_hash: tokenHash,
          expires_at: expiresAt,
          side: boundSide,
          invited_by: actor.userId,
        })
        .eq("id", existing.id);
    } else {
      await actor.admin.from("invites").insert({
        deal_id: dealId,
        email: normalized,
        role,
        side: boundSide,
        token_hash: tokenHash,
        expires_at: expiresAt,
        invited_by: actor.userId,
      });
    }

    const url = `${siteUrl()}/invite/${token}`;
    await insertEvent(actor.admin, dealId, actor.userId, "party.invited", {
      email: normalized,
      role,
      side: boundSide,
      invite_url: url,
      inviter: actor.profile.full_name ?? actor.email,
    });
    const snap = await fresh();
    return {
      ok: true,
      data: {
        url,
        expiresAt,
        snapshot: snap.ok ? snap.data : ({} as AppSnapshot),
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}

export async function previewInviteAction(
  token: string,
): Promise<ActionResult<{ email: string; role: string; side: string; dealId: string; expired: boolean }>> {
  try {
    const actor = await requireActor().catch(() => null);
    const admin = actor?.admin ?? (await import("@/lib/supabase/admin")).createServiceRoleClient();
    const { data: invite } = await admin
      .from("invites")
      .select("*")
      .eq("token_hash", hashToken(token))
      .maybeSingle();
    if (!invite) throw new DealActionError("not_found", "Invite not found.");
    return {
      ok: true,
      data: {
        email: invite.email,
        role: invite.role,
        side: invite.side,
        dealId: invite.deal_id,
        expired: Boolean(invite.accepted_at) || new Date(invite.expires_at).getTime() < Date.now(),
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}

export async function acceptInviteAction(token: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { data: invite } = await actor.admin
      .from("invites")
      .select("*")
      .eq("token_hash", hashToken(token))
      .maybeSingle();
    if (!invite) throw new DealActionError("not_found", "Invite not found.");
    if (invite.accepted_at) throw new DealActionError("wrong_state", "This invite was already accepted.");
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      throw new DealActionError("wrong_state", "This invite expired.");
    }
    const actorEmail = (actor.email || actor.profile.email || "").toLowerCase();
    if (actorEmail && actorEmail !== invite.email.toLowerCase()) {
      throw new DealActionError(
        "forbidden",
        `Sign in as ${invite.email} to accept this invite.`,
      );
    }

    const role = invite.role as Tables<"deal_parties">["role"];
    await actor.admin.from("deal_parties").upsert(
      {
        deal_id: invite.deal_id,
        user_id: actor.userId,
        role,
        side: invite.side,
      },
      { onConflict: "deal_id,user_id,role" },
    );
    await actor.admin
      .from("invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    if (role === "vendor" || role === "inspector") {
      const { data: existingVendor } = await actor.admin
        .from("vendors")
        .select("id")
        .eq("user_id", actor.userId)
        .maybeSingle();
      if (!existingVendor) {
        await actor.admin.from("vendors").insert({
          user_id: actor.userId,
          business_name: actor.profile.full_name || invite.email,
          services: role === "inspector" ? ["Inspector"] : [],
          active: true,
        });
      }
    }

    await insertEvent(actor.admin, invite.deal_id, actor.userId, "party.joined", {
      role: invite.role,
      email: invite.email,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}
