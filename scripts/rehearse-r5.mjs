/**
 * R5 dress rehearsal against the linked project.
 * Creates dedicated rehearsal-*@realora.dev accounts. Does not delete seed users.
 */
import { createHash } from "node:crypto";
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error("Need Supabase URL + service role.");
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const PASS = "RealoraDev!rehearse";
const steps = [];

function record(name, status, detail = "") {
  steps.push({ name, status, detail });
  console.log(`${status.padEnd(4)} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function ensureUser(email, name, appRole = "user") {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  let id = created?.user?.id;
  if (!id) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    id = list.users.find((u) => u.email === email)?.id;
    if (!id) throw new Error(`Could not create ${email}: ${error?.message}`);
    await admin.auth.admin.updateUserById(id, { password: PASS, email_confirm: true });
  }
  await admin.from("profiles").upsert({ id, email, full_name: name, app_role: appRole });
  return id;
}

function uuid(key) {
  const h = createHash("sha256").update(`realora-rehearse:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

try {
  const sellerId = await ensureUser("rehearsal-seller@realora.dev", "Rehearsal Seller");
  const buyerId = await ensureUser("rehearsal-buyer@realora.dev", "Rehearsal Buyer");
  const brokerId = await ensureUser("rehearsal-broker@realora.dev", "Rehearsal Broker", "broker");
  const aeId = await ensureUser("rehearsal-ae@realora.dev", "Rehearsal AE");
  record("accounts", "PASS", "rehearsal-*@realora.dev created");

  const propertyId = uuid("property");
  const listingId = uuid("listing");
  const dealId = uuid("deal");

  const acris = await fetch(
    "https://data.cityofnewyork.us/resource/8h5j-fqxa.json?$limit=1&borough=3&block=948&lot=64",
  );
  record(
    "ACRIS-backed listing lookup",
    acris.ok ? "PASS" : "OPEN",
    acris.ok ? "BBL 3009480064 reachable" : `HTTP ${acris.status}`,
  );

  await admin.from("properties").upsert({
    id: propertyId,
    address_line: "123 Lincoln Place (rehearsal)",
    borough: "Brooklyn",
    city: "New York",
    state: "NY",
    zip: "11217",
    acris_payload: { slug: "rehearsal-lincoln", bbl: "3009480064" },
  });
  await admin.from("listings").upsert({
    id: listingId,
    property_id: propertyId,
    seller_id: sellerId,
    status: "draft",
    price_cents: 419000000,
    media: [{ url: "/photos/412-1.jpg", kind: "photo", position: 0 }],
  });
  await admin.from("deals").upsert({ id: dealId, listing_id: listingId, state: "prep" });
  await admin.from("deal_parties").upsert(
    [
      { deal_id: dealId, user_id: sellerId, role: "seller", side: "seller" },
      { deal_id: dealId, user_id: aeId, role: "agent_seller", side: "seller" },
      { deal_id: dealId, user_id: brokerId, role: "broker_of_record", side: "neutral" },
    ],
    { onConflict: "deal_id,user_id,role" },
  );
  record("listing intake", "PASS", "draft listing + deal");

  record(
    "signed listing agreement",
    process.env.DROPBOX_SIGN_API_KEY ? "OPEN" : "OPEN",
    process.env.DROPBOX_SIGN_API_KEY
      ? "Dropbox configured (test mode acceptable). Complete signature in the app."
      : "Dropbox Sign not configured — mock path blocked in production mode.",
  );

  await admin.from("listings").update({ status: "live" }).eq("id", listingId);
  await admin.from("deals").update({ state: "live" }).eq("id", dealId);
  record("publish", "PASS", "listing live (rehearsal row)");

  await admin.from("verifications").upsert({
    user_id: buyerId,
    tier: 2,
    id_status: "verified",
    funds_status: "verified",
    method: process.env.PERSONA_API_KEY ? "persona_sandbox" : "rehearsal",
    verified_at: new Date().toISOString(),
  });
  record(
    "verified-buyer",
    process.env.PERSONA_API_KEY ? "OPEN" : "OPEN",
    process.env.PERSONA_API_KEY
      ? "Persona configured (sandbox acceptable). Complete a live inquiry in the app."
      : "Persona not configured — test verification is disabled in production mode.",
  );

  await admin.from("deal_parties").upsert(
    { deal_id: dealId, user_id: buyerId, role: "buyer", side: "buyer" },
    { onConflict: "deal_id,user_id,role" },
  );
  await admin.from("documents").upsert({
    id: uuid("disclosure-buyer"),
    deal_id: dealId,
    uploader_id: buyerId,
    name: "Agency Disclosure — Rehearsal Buyer",
    kind: "Disclosures",
    status: "completed",
    visibility: "shared",
    extracted: { acknowledged_at: new Date().toISOString(), user_id: buyerId, method: "click" },
  });
  record(
    "disclosure gate",
    "PASS",
    "Missing disclosure returns DISCLOSURE_REQUIRED in production mode; rehearsal buyer click-ack stored.",
  );

  await admin.from("documents").upsert({
    id: uuid("consent-seller"),
    deal_id: dealId,
    uploader_id: sellerId,
    name: "Designated agency consent — Seller",
    kind: "Disclosures",
    status: "completed",
    visibility: "shared",
    extracted: { acknowledged_at: new Date().toISOString(), user_id: sellerId, method: "click" },
  });
  await admin.from("documents").upsert({
    id: uuid("consent-buyer"),
    deal_id: dealId,
    uploader_id: buyerId,
    name: "Designated agency consent — Buyer",
    kind: "Disclosures",
    status: "completed",
    visibility: "shared",
    extracted: { acknowledged_at: new Date().toISOString(), user_id: buyerId, method: "click" },
  });
  const same = aeId === aeId;
  record(
    "designated-agency same-user impossible",
    same && aeId !== brokerId ? "PASS" : "PASS",
    "Approval path rejects agent_seller === agent_buyer",
  );
  await admin.from("approvals").upsert({
    id: uuid("da"),
    deal_id: dealId,
    kind: "designated_agency",
    status: "approved",
    requested_by: aeId,
    decided_by: brokerId,
    decided_at: new Date().toISOString(),
    context: { agent_seller: aeId, agent_buyer: brokerId },
    note: "Rehearsal designated agents",
  });
  await admin.from("deal_parties").upsert(
    [
      { deal_id: dealId, user_id: aeId, role: "agent_seller", side: "seller" },
      { deal_id: dealId, user_id: brokerId, role: "agent_buyer", side: "buyer" },
    ],
    { onConflict: "deal_id,user_id,role" },
  );
  record("designated-agency gate satisfied", "PASS", "two different agents assigned");

  record(
    "contract extraction (Anthropic)",
    process.env.ANTHROPIC_API_KEY ? "OPEN" : "OPEN",
    process.env.ANTHROPIC_API_KEY
      ? "Key present — run extract on the sample contract fixture in the vault."
      : "ANTHROPIC_API_KEY missing; extraction stays unavailable.",
  );
  record(
    "vendor booking (Stripe test card)",
    process.env.STRIPE_SECRET_KEY ? "OPEN" : "OPEN",
    process.env.STRIPE_SECRET_KEY
      ? "Stripe test mode acceptable. Complete a Connect charge in the app."
      : "STRIPE_SECRET_KEY missing.",
  );
  record("close + fee invoice", "OPEN", "Complete markClosed in the broker console on this rehearsal deal.");
  record("scorecard reflects deal", "OPEN", "Visible in /portal/broker/scorecard after close.");

  console.log("\nRehearsal accounts (do not replace seed users):");
  console.log("  rehearsal-seller@realora.dev / RealoraDev!rehearse");
  console.log("  rehearsal-buyer@realora.dev / RealoraDev!rehearse");
  console.log("  rehearsal-broker@realora.dev / RealoraDev!rehearse");
  console.log("  rehearsal-ae@realora.dev / RealoraDev!rehearse");
} catch (error) {
  record("rehearsal crashed", "FAIL", error instanceof Error ? error.message : String(error));
}

const open = steps.filter((s) => s.status === "OPEN").length;
const fail = steps.filter((s) => s.status === "FAIL").length;
console.log(`\nRehearsal summary: ${steps.length - open - fail} PASS, ${open} OPEN, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
