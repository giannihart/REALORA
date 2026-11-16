import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicSupabaseUrl } from "@/lib/supabase/env";
import { personaConfigured } from "@/lib/site";

const PERSONA_VERSION = "2023-01-05";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(publicSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isIdApproved(status: string | null | undefined): boolean {
  return status === "approved" || status === "verified";
}

export function computeTier(input: {
  id_status: string | null;
  funds_status: string | null;
  method?: string | null;
}): number {
  if (input.method === "ownership_verified" || input.method === "ownership_ae_approved") return 3;
  if (isIdApproved(input.id_status) && input.funds_status === "verified") return 2;
  if (isIdApproved(input.id_status) || input.funds_status === "verified") return 1;
  return 0;
}

export async function recomputeVerification(
  userId: string,
  patch: Partial<Database["public"]["Tables"]["verifications"]["Update"]> = {},
) {
  const admin = adminClient();
  const { data: current } = await admin
    .from("verifications")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const next = {
    user_id: userId,
    id_status: patch.id_status ?? current?.id_status ?? "pending",
    funds_status: patch.funds_status ?? current?.funds_status ?? "pending",
    method: patch.method ?? current?.method ?? null,
    persona_inquiry_id: patch.persona_inquiry_id ?? current?.persona_inquiry_id ?? null,
    verified_at: patch.verified_at ?? current?.verified_at ?? null,
    preapproval_status:
      patch.preapproval_status !== undefined
        ? patch.preapproval_status
        : (current?.preapproval_status ?? null),
    approved_amount_cents:
      patch.approved_amount_cents !== undefined
        ? patch.approved_amount_cents
        : (current?.approved_amount_cents ?? null),
    lender_name:
      patch.lender_name !== undefined ? patch.lender_name : (current?.lender_name ?? null),
    preapproval_confirmed_at:
      patch.preapproval_confirmed_at !== undefined
        ? patch.preapproval_confirmed_at
        : (current?.preapproval_confirmed_at ?? null),
  };
  const method = next.method ?? "";
  const ownership = method === "ownership_verified" || method === "ownership_ae_approved";
  // Financed pre-approval confirmation counts as funds-verified for tier math
  // without writing cash funds_status.
  const fundsForTier =
    next.preapproval_status === "verified" ? "verified" : next.funds_status;
  const tier = ownership
    ? 3
    : computeTier({
        id_status: next.id_status,
        funds_status: fundsForTier,
        method: next.method,
      });
  await admin.from("verifications").upsert({
    ...next,
    tier,
    verified_at: tier >= 2 ? (next.verified_at ?? new Date().toISOString()) : next.verified_at,
  });
  return { ...next, tier };
}

export async function createPersonaInquiry(userId: string): Promise<{
  inquiryId: string;
  hostedUrl: string;
}> {
  const key = process.env.PERSONA_API_KEY;
  const template = process.env.PERSONA_TEMPLATE_ID;
  if (!key || !template) throw new Error("Persona is not configured.");
  const res = await fetch("https://withpersona.com/api/v1/inquiries", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Persona-Version": PERSONA_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          "inquiry-template-id": template,
          "reference-id": userId,
        },
      },
    }),
  });
  const json = (await res.json()) as {
    data?: { id?: string };
    errors?: { title?: string }[];
  };
  if (!res.ok || !json.data?.id) {
    throw new Error(json.errors?.[0]?.title ?? `Persona ${res.status}`);
  }
  const inquiryId = json.data.id;
  await recomputeVerification(userId, { persona_inquiry_id: inquiryId });
  return {
    inquiryId,
    hostedUrl: `https://inquiry.withpersona.com/verify?inquiry-id=${inquiryId}`,
  };
}

export function personaStatusApproved(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "completed" || s === "approved" || s === "passed";
}

export { personaConfigured };
