"use server";

import { createHash, createHmac, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { Resend } from "resend";
import { fail, type ActionResult } from "@/lib/actions/errors";
import { isSeedDevEmail } from "@/lib/auth/seed-accounts";
import { isLocalDataMode } from "@/lib/data/mode";
import { resendConfigured } from "@/lib/site";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  VERIFICATION_LOGO_CID,
  verificationCodeEmail,
} from "@/lib/email/verification-code-email";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type AuthEmailPurpose = "signin" | "signup";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const COOKIE_NAME = "realora_auth_email_otp";

type CookiePayload = {
  email: string;
  purpose: AuthEmailPurpose;
  codeHash: string;
  expiresAt: number;
  attempts: number;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(email: string, code: string) {
  return createHash("sha256")
    .update(`${normalizeEmail(email)}:${code}`)
    .digest("hex");
}

function signingSecret() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.RESEND_API_KEY ||
    "realora-dev-otp"
  );
}

function signPayload(body: string) {
  return createHmac("sha256", signingSecret()).update(body).digest("hex");
}

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function verificationLogoAttachment() {
  const path = join(process.cwd(), "public/email/realora-logo-lime.png");
  const content = readFileSync(path);
  return {
    filename: "realora-logo-lime.png",
    content,
    contentId: VERIFICATION_LOGO_CID,
    contentType: "image/png",
  };
}

async function deliverCodeEmail(to: string, code: string): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const resend = new Resend(key);
  const from = process.env.RESEND_FROM || "REALORA <notifications@realora.dev>";
  const { subject, text, html } = verificationCodeEmail(code);
  const result = await resend.emails.send({
    from,
    to,
    subject,
    text,
    html,
    attachments: [verificationLogoAttachment()],
  });
  if (result.error) throw new Error(result.error.message);
  return result.data?.id ?? null;
}

async function writeCookieChallenge(payload: CookiePayload) {
  const body = JSON.stringify(payload);
  const value = `${Buffer.from(body).toString("base64url")}.${signPayload(body)}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.ceil(CODE_TTL_MS / 1000),
  });
}

async function readCookieChallenge(): Promise<CookiePayload | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const [encoded, sig] = raw.split(".");
  if (!encoded || !sig) return null;
  const body = Buffer.from(encoded, "base64url").toString("utf8");
  if (signPayload(body) !== sig) return null;
  try {
    return JSON.parse(body) as CookiePayload;
  } catch {
    return null;
  }
}

async function clearCookieChallenge() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

async function persistCodeToDb(input: {
  email: string;
  purpose: AuthEmailPurpose;
  codeHash: string;
  expiresAt: string;
}): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    await admin
      .from("auth_email_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("email", input.email)
      .eq("purpose", input.purpose)
      .is("consumed_at", null);

    const { error } = await admin.from("auth_email_codes").insert({
      email: input.email,
      code_hash: input.codeHash,
      purpose: input.purpose,
      expires_at: input.expiresAt,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Issues a fresh 6-digit code for sign-in or sign-up email verification.
 * When Resend is unconfigured, returns `devCode` so local/dev can still verify.
 */
export async function sendAuthEmailCodeAction(input: {
  email: string;
  purpose: AuthEmailPurpose;
}): Promise<ActionResult<{ emailed: boolean; devCode?: string }>> {
  if (isLocalDataMode()) {
    return { ok: true, data: { emailed: false, devCode: "000000" } };
  }

  const email = normalizeEmail(input.email);
  if (!email.includes("@")) return fail("validation", "Enter a valid email.");
  if (isSeedDevEmail(email)) {
    return { ok: true, data: { emailed: false, devCode: "000000" } };
  }

  try {
    const code = generateCode();
    const codeHash = hashCode(email, code);
    const expiresAtMs = Date.now() + CODE_TTL_MS;
    const expires_at = new Date(expiresAtMs).toISOString();

    await persistCodeToDb({
      email,
      purpose: input.purpose,
      codeHash,
      expiresAt: expires_at,
    });

    // Cookie fallback always written so verification works before the SQL migration is applied.
    await writeCookieChallenge({
      email,
      purpose: input.purpose,
      codeHash,
      expiresAt: expiresAtMs,
      attempts: 0,
    });

    if (!resendConfigured()) {
      return { ok: true, data: { emailed: false, devCode: code } };
    }

    try {
      const providerId = await deliverCodeEmail(email, code);
      if (!providerId) {
        return { ok: true, data: { emailed: false, devCode: code } };
      }
      return { ok: true, data: { emailed: true } };
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      if (/domain is not verified/i.test(detail)) {
        return fail(
          "unavailable",
          "Email couldn’t send: verify realora.dev in Resend, or set RESEND_FROM to Realora <onboarding@resend.dev> for testing.",
        );
      }
      return fail(
        "unavailable",
        detail
          ? `Couldn’t send the verification email: ${detail}`
          : "Couldn’t send the verification email. Check RESEND_API_KEY / RESEND_FROM and try again.",
      );
    }
  } catch {
    return fail("unavailable", "Couldn’t start email verification. Try again.");
  }
}

export async function verifyAuthEmailCodeAction(input: {
  email: string;
  purpose: AuthEmailPurpose;
  code: string;
}): Promise<ActionResult<{ verified: true }>> {
  if (isLocalDataMode()) {
    return { ok: true, data: { verified: true } };
  }

  const email = normalizeEmail(input.email);
  const code = input.code.replace(/\D/g, "");
  if (code.length !== 6) {
    return fail("validation", "Enter the 6-digit code from your email.");
  }
  if (isSeedDevEmail(email)) {
    return { ok: true, data: { verified: true } };
  }

  const expected = hashCode(email, code);

  // Prefer DB row when migration is applied; fall back to signed cookie.
  try {
    const admin = createServiceRoleClient();
    const { data: rows } = await admin
      .from("auth_email_codes")
      .select("id, code_hash, expires_at, attempt_count, consumed_at")
      .eq("email", email)
      .eq("purpose", input.purpose)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const row = rows?.[0];
    if (row) {
      if (new Date(row.expires_at).getTime() < Date.now()) {
        await admin
          .from("auth_email_codes")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", row.id);
        return fail("validation", "That code expired. Request a new one.");
      }
      if (row.attempt_count >= MAX_ATTEMPTS) {
        await admin
          .from("auth_email_codes")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", row.id);
        return fail("validation", "Too many attempts. Request a new code.");
      }
      if (row.code_hash !== expected) {
        await admin
          .from("auth_email_codes")
          .update({ attempt_count: row.attempt_count + 1 })
          .eq("id", row.id);
        return fail("validation", "That code doesn’t match. Try again.");
      }
      await admin
        .from("auth_email_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id);
      await clearCookieChallenge();
      return { ok: true, data: { verified: true } };
    }
  } catch {
    // fall through to cookie
  }

  const challenge = await readCookieChallenge();
  if (
    !challenge ||
    challenge.email !== email ||
    challenge.purpose !== input.purpose
  ) {
    return fail("validation", "That code is invalid or expired. Request a new one.");
  }
  if (challenge.expiresAt < Date.now()) {
    await clearCookieChallenge();
    return fail("validation", "That code expired. Request a new one.");
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    await clearCookieChallenge();
    return fail("validation", "Too many attempts. Request a new code.");
  }
  if (challenge.codeHash !== expected) {
    await writeCookieChallenge({
      ...challenge,
      attempts: challenge.attempts + 1,
    });
    return fail("validation", "That code doesn’t match. Try again.");
  }

  await clearCookieChallenge();
  return { ok: true, data: { verified: true } };
}
