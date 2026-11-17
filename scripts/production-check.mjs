/**
 * Production hardening gate. Exit 1 with an itemized list when a production-mode
 * config still has seed defaults, placeholder identity, missing cron secret, or
 * vendors in mock. Vendor test-mode keys warn but do not fail.
 *
 * Usage:
 *   NEXT_PUBLIC_DATA_MODE=production node scripts/production-check.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

const failures = [];
const warnings = [];

if (process.env.NEXT_PUBLIC_DATA_MODE !== "production") {
  failures.push(
    `NEXT_PUBLIC_DATA_MODE is "${process.env.NEXT_PUBLIC_DATA_MODE ?? ""}" (need production).`,
  );
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  failures.push("Missing NEXT_PUBLIC_SUPABASE_URL / ANON / SERVICE_ROLE_KEY.");
}

/** Legacy weak passwords that must never work on a production project. */
const LEGACY_WEAK_PASSWORDS = [
  ["seller@realora.dev", "RealoraDev!seller"],
  ["buyer@realora.dev", "RealoraDev!buyer"],
  ["broker@realora.dev", "RealoraDev!broker"],
  ["offera@realora.dev", "RealoraDev!offera"],
  ["offerc@realora.dev", "RealoraDev!offerc"],
];

const cron = process.env.CRON_SECRET ?? "";
if (!cron || ["secret", "changeme", "change-me", "CRON_SECRET", "default"].includes(cron)) {
  failures.push("CRON_SECRET is unset or a documented default.");
}

// Native SignatureCapture is the production e-sign path; Dropbox is parked/unselected.
const dropbox = Boolean(process.env.DROPBOX_SIGN_API_KEY && process.env.DROPBOX_SIGN_CLIENT_ID);
const persona = Boolean(process.env.PERSONA_API_KEY && process.env.PERSONA_TEMPLATE_ID);
const stripe = Boolean(process.env.STRIPE_SECRET_KEY);
const anthropic = Boolean(process.env.ANTHROPIC_API_KEY);
const resend = Boolean(process.env.RESEND_API_KEY);
const twilio = Boolean(
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER,
);

if (!persona) failures.push("Persona is in mock/unavailable mode (missing API key + template).");
if (!stripe) failures.push("Stripe is in mock/unavailable mode (missing STRIPE_SECRET_KEY).");
if (!anthropic) failures.push("Anthropic is unavailable (missing ANTHROPIC_API_KEY).");
if (!resend) failures.push("Resend is unavailable (missing RESEND_API_KEY).");
if (!twilio) failures.push("Twilio is unavailable (missing TWILIO_*).");

if ((process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_")) {
  warnings.push("Stripe key is test-mode (sk_test_). Launch flip: live Connect charge.");
}
if (dropbox) {
  warnings.push(
    "Dropbox Sign keys are set but unused — platform documents use native SignatureCapture.",
  );
}
if (persona) warnings.push("Persona is configured — confirm live inquiry vs sandbox before go-live.");

if (url && anon && service) {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: settings } = await admin.from("settings").select("key, value");
  const map = Object.fromEntries((settings ?? []).map((r) => [r.key, r.value]));
  const name = map.brokerage_legal_name ?? "";
  const license = map.brokerage_license_number ?? "";
  if (!name || /placeholder/i.test(name) || !license || license === "PENDING") {
    failures.push(
      `Brokerage identity is still placeholder (name="${name || "(empty)"}", license="${license || "(empty)"}").`,
    );
  }

  for (const [email, password] of LEGACY_WEAK_PASSWORDS) {
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      failures.push(`Legacy weak password still works for ${email}.`);
      await client.auth.signOut();
    }
  }
}

console.log("production-check");
if (failures.length) {
  console.log("FAIL");
  for (const item of failures) console.log(`  - ${item}`);
} else {
  console.log("PASS");
}
if (warnings.length) {
  console.log("WARN");
  for (const item of warnings) console.log(`  - ${item}`);
}

process.exit(failures.length ? 1 : 0);
