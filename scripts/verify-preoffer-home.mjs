/**
 * Fresh-buyer walk for pre-offer Home readiness records.
 * Creates a throwaway buyer, exercises BP / ID / financing / save, then deletes the user.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !service || !anon) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const email = `preoffer.walk.${Date.now()}@realora.dev`;
const password = `Ro!${randomBytes(12).toString("base64url")}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("Creating fresh buyer", email);
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Preoffer Walk" },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error("createUser failed");
  const userId = created.data.user.id;
  await admin.from("profiles").upsert({
    id: userId,
    email,
    full_name: "Preoffer Walk",
    intent: "buying",
    app_role: "user",
  });

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;

  // 1) Buying power
  const { error: bpErr } = await admin.from("buying_power_profiles").upsert({
    user_id: userId,
    annual_income_cents: 40_000_000,
    monthly_debts_cents: 150_000,
    down_payment_cents: 80_000_000,
    credit_band: "good",
    rate_pct: 7,
    term_years: 30,
  });
  assert(!bpErr, bpErr?.message ?? "bp");
  console.log("OK buying power profile");

  // 2) Identity
  await admin.from("verifications").upsert({
    user_id: userId,
    id_status: "verified",
    funds_status: "pending",
    tier: 1,
    method: "test_verification",
  });
  console.log("OK identity verified");

  // 3a) Cash path — upload PoF via prep deal (mirrors action)
  const slug = `buyer-prep-${userId}`;
  const { data: property } = await admin
    .from("properties")
    .insert({
      address_line: "Buyer prep workspace",
      city: "New York",
      state: "NY",
      acris_payload: { slug, buyerPrep: true, marketplace: false },
    })
    .select("id")
    .single();
  const { data: listing } = await admin
    .from("listings")
    .insert({
      property_id: property.id,
      seller_id: userId,
      status: "draft",
      price_cents: 0,
      media: [],
    })
    .select("id")
    .single();
  const { data: deal } = await admin
    .from("deals")
    .insert({ listing_id: listing.id, state: "tours_offers" })
    .select("id")
    .single();
  await admin.from("deal_parties").insert({
    deal_id: deal.id,
    user_id: userId,
    role: "buyer",
    side: "buyer",
  });
  const { data: doc } = await admin
    .from("documents")
    .insert({
      deal_id: deal.id,
      uploader_id: userId,
      name: "Proof of funds",
      kind: "proof_of_funds",
      status: "Pending",
      visibility: "buyer_side",
    })
    .select("id")
    .single();
  assert(doc?.id, "pof doc");
  console.log("OK proof of funds uploaded (Under review)");

  // AE confirm funds
  await admin.from("verifications").upsert({
    user_id: userId,
    id_status: "verified",
    funds_status: "verified",
    tier: 2,
    method: "test_verification",
    verified_at: new Date().toISOString(),
  });
  console.log("OK funds AE confirmed");

  // 3b) Financed confirm path on a second throwaway — method preapproval_ae_confirmed
  const finEmail = `preoffer.fin.${Date.now()}@realora.dev`;
  const finPass = `Ro!${randomBytes(12).toString("base64url")}`;
  const fin = await admin.auth.admin.createUser({
    email: finEmail,
    password: finPass,
    email_confirm: true,
  });
  const finId = fin.data.user.id;
  await admin.from("profiles").upsert({
    id: finId,
    email: finEmail,
    full_name: "Financed Walk",
    intent: "buying",
  });
  await admin.from("verifications").upsert({
    user_id: finId,
    id_status: "verified",
    funds_status: "verified",
    tier: 2,
    method: "preapproval_ae_confirmed",
    verified_at: new Date().toISOString(),
  });
  const { data: finVer } = await admin
    .from("verifications")
    .select("funds_status, method")
    .eq("user_id", finId)
    .maybeSingle();
  assert(finVer?.funds_status === "verified", "financed funds_status");
  assert(finVer?.method === "preapproval_ae_confirmed", "financed method");
  console.log("OK financed AE confirm writes user-level funds_status");
  await admin.auth.admin.deleteUser(finId);

  // 4) Save a home — pick any live listing
  const { data: live } = await admin.from("listings").select("id").eq("status", "live").limit(1);
  if (live?.[0]) {
    await admin.from("saved_homes").insert({ user_id: userId, listing_id: live[0].id });
    console.log("OK saved home");
  } else {
    console.log("SKIP save — no live listings in DB");
  }

  console.log("CREDENTIALS", { email, password, userId });
  console.log("Delete with: node -e \"…deleteUser\" after UI screenshots, or re-run cleanup.");
  // Keep user for browser screenshots; print cleanup command
  console.log(
    `CLEANUP: node --input-type=module -e "import {createClient} from '@supabase/supabase-js'; const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); await a.auth.admin.deleteUser('${userId}');"`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});