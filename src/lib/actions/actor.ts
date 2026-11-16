import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DealActionError } from "@/lib/actions/errors";
import type { Json, Tables } from "@/lib/database.types";
import type { PartyRole, PartySide } from "@/lib/data/map";

export type Actor = {
  userId: string;
  email: string;
  profile: Tables<"profiles">;
  verification: Tables<"verifications"> | null;
  admin: ReturnType<typeof createServiceRoleClient>;
};

export async function requireActor(): Promise<Actor> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new DealActionError("unauthenticated", "Sign in required.");

  const admin = createServiceRoleClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) throw new DealActionError("unauthenticated", "Profile missing.");

  const { data: verification } = await admin
    .from("verifications")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? profile.email ?? "",
    profile,
    verification,
    admin,
  };
}

export function isStaff(actor: Actor): boolean {
  return actor.profile.app_role === "broker" || actor.profile.app_role === "admin";
}

export async function loadParties(
  admin: Actor["admin"],
  dealId: string,
): Promise<Tables<"deal_parties">[]> {
  const { data, error } = await admin.from("deal_parties").select("*").eq("deal_id", dealId);
  if (error) throw new DealActionError("validation", error.message);
  return data ?? [];
}

export function partyRoles(parties: Tables<"deal_parties">[], userId: string): PartyRole[] {
  return parties.filter((p) => p.user_id === userId).map((p) => p.role);
}

export function isParty(parties: Tables<"deal_parties">[], userId: string): boolean {
  return parties.some((p) => p.user_id === userId);
}

export function isSellerSide(parties: Tables<"deal_parties">[], userId: string): boolean {
  return parties.some((p) => p.user_id === userId && p.side === "seller");
}

export function hasRole(
  parties: Tables<"deal_parties">[],
  userId: string,
  roles: PartyRole[],
): boolean {
  return parties.some((p) => p.user_id === userId && roles.includes(p.role));
}

export async function insertEvent(
  admin: Actor["admin"],
  dealId: string | null,
  actorId: string | null,
  type: string,
  payload: Record<string, unknown> = {},
) {
  const { error } = await admin.from("events").insert({
    deal_id: dealId,
    actor_id: actorId,
    type,
    payload: payload as Json,
  });
  if (error) throw new DealActionError("validation", error.message);
  if (!dealId) return;
  try {
    const { dispatchFromEvent } = await import("@/lib/notifications/dispatch");
    await dispatchFromEvent(admin, dealId, actorId, type, payload);
  } catch (err) {
    console.error("notification dispatch failed", err);
  }
}

export async function insertTaskRows(
  admin: Actor["admin"],
  dealId: string,
  actorId: string | null,
  rows: {
    title: string;
    description?: string;
    owner_role?: string | null;
    owner_user_id?: string | null;
    status?: Tables<"tasks">["status"];
    due_date?: string | null;
    auto?: boolean;
  }[],
) {
  if (!rows.length) return;
  const parties = await loadParties(admin, dealId);
  const withOwners = rows.map((row) => {
    const owner =
      row.owner_user_id ??
      parties.find((p) => p.role === row.owner_role)?.user_id ??
      null;
    return {
      deal_id: dealId,
      title: row.title,
      description: row.description ?? null,
      owner_role: row.owner_role ?? null,
      owner_user_id: owner,
      status: row.status ?? ("pending" as const),
      due_date: row.due_date ?? null,
      auto: row.auto ?? true,
    };
  });
  const { error } = await admin.from("tasks").insert(withOwners);
  if (error) throw new DealActionError("validation", error.message);
  for (const row of withOwners) {
    await insertEvent(admin, dealId, actorId, "task.assigned", {
      title: row.title,
      description: row.description,
      owner_role: row.owner_role,
      owner_user_id: row.owner_user_id,
      due_date: row.due_date,
    });
  }
}

export function assertState(
  actual: string,
  allowed: string[],
): void {
  if (!allowed.includes(actual)) {
    throw new DealActionError(
      "wrong_state",
      `This action is not available from ${actual}.`,
    );
  }
}

export function assertParty(ok: boolean, message = "You are not a party to this deal.") {
  if (!ok) throw new DealActionError("forbidden", message);
}

export type { PartySide };
