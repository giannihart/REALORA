import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { insertEvent } from "@/lib/actions/actor";
import {
  personaStatusApproved,
  recomputeVerification,
} from "@/lib/services/verification-persona";

export const runtime = "nodejs";

type PersonaPayload = {
  data?: {
    type?: string;
    id?: string;
    attributes?: Record<string, unknown>;
  };
};

function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.PERSONA_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const t = header.replace(/^t=\d+,v1=/i, "").replace(/^sha256=/i, "");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(t);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("persona-signature"))) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }
  const body = JSON.parse(raw) as PersonaPayload;
  const data = body.data ?? {};
  const attrs = data.attributes ?? {};
  const inquiryId = typeof data.id === "string" ? data.id : String(attrs["inquiry-id"] ?? "");
  const status = String(attrs.status ?? attrs["status"] ?? "");
  const referenceId = String(attrs["reference-id"] ?? attrs.referenceId ?? "");
  if (!personaStatusApproved(status)) {
    return NextResponse.json({ ok: true, ignored: true, status });
  }

  const admin = createServiceRoleClient();
  let userId = referenceId;
  if (!userId && inquiryId) {
    const { data: row } = await admin
      .from("verifications")
      .select("user_id")
      .eq("persona_inquiry_id", inquiryId)
      .maybeSingle();
    userId = row?.user_id ?? "";
  }
  if (!userId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "no user" });
  }

  await recomputeVerification(userId, {
    id_status: "approved",
    persona_inquiry_id: inquiryId || null,
    verified_at: new Date().toISOString(),
    method: "persona",
  });

  const { data: parties } = await admin
    .from("deal_parties")
    .select("deal_id")
    .eq("user_id", userId)
    .limit(1);
  if (parties?.[0]) {
    await insertEvent(admin, parties[0].deal_id, userId, "verification.persona_approved", {
      inquiry_id: inquiryId,
      status,
      reference_id: referenceId,
      fields: ["data.id", "data.attributes.status", "data.attributes.reference-id"],
    });
  }

  return NextResponse.json({ ok: true });
}
