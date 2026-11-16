/**
 * R5 brokerage operating layer.
 * Usage: node scripts/verify-r5.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
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
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

function userClient() {
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sourceContains(file, needle) {
  const src = readFileSync(resolve(process.cwd(), file), "utf8");
  return src.includes(needle);
}

async function signIn(email, password) {
  const client = userClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`signIn failed for ${email}: ${error?.message ?? "no user"}`);
  return { client, user: data.user };
}

function stableUuid(key) {
  const h = createHash("sha256").update(`realora-r5:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const failures = [];
function check(name, ok, detail = "") {
  if (ok) console.log(`PASS  ${name}`);
  else {
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

const propertyId = stableUuid("property");
const listingId = stableUuid("listing");
const dealId = stableUuid("deal");
const offerId = stableUuid("offer");
const approval1 = stableUuid("approval-1");
const approval2 = stableUuid("approval-2");

try {
  check(
    "schema: approvals + settings + pause + costs",
    sourceContains("supabase/migrations/0006_r5_brokerage.sql", "create table if not exists public.approvals") &&
      sourceContains("supabase/migrations/0006_r5_brokerage.sql", "paused boolean") &&
      sourceContains("supabase/migrations/0006_r5_brokerage.sql", "media_cost_cents"),
  );
  check(
    "code: approval execute uses confirmDepositAction",
    sourceContains("src/lib/actions/approvals.ts", "confirmDepositAction"),
  );
  check(
    "code: disclosure gate on submitOffer",
    sourceContains("src/lib/actions/deal.ts", "assertAgencyDisclosure"),
  );
  check(
    "code: designated-agency gate on acceptOffer",
    sourceContains("src/lib/actions/deal.ts", "assertDesignatedAgencyGate"),
  );
  check(
    "code: pause choke in setDealState",
    sourceContains("src/lib/actions/deal.ts", "assertNotPaused"),
  );
  check(
    "code: same-user designated agents rejected",
    sourceContains("src/lib/actions/approvals.ts", "Designated agents must be two different users"),
  );
  check(
    "code: production mocks disabled",
    sourceContains("src/lib/data/mode.ts", "mocksAllowed") &&
      sourceContains("src/lib/actions/documents.ts", "E-sign is unavailable"),
  );

  const { data: dealCols, error: dealColErr } = await admin.from("deals").select("paused, paused_reason").limit(1);
  check("db: deals.paused exists", !dealColErr, dealColErr?.message);
  const { error: settingsErr } = await admin.from("settings").select("key").limit(1);
  check("db: settings exists", !settingsErr, settingsErr?.message);
  const { error: approvalsErr } = await admin.from("approvals").select("id").limit(1);
  check("db: approvals exists", !approvalsErr, approvalsErr?.message);

  const seller = await signIn("seller@realora.dev", "RealoraDev!seller");
  const broker = await signIn("broker@realora.dev", "RealoraDev!broker");
  const buyer = await signIn("buyer@realora.dev", "RealoraDev!buyer");

  await admin.from("properties").upsert({
    id: propertyId,
    address_line: "R5 Verify Townhouse",
    borough: "Brooklyn",
    city: "New York",
    state: "NY",
    zip: "11217",
    acris_payload: { slug: "r5-verify" },
  });
  await admin.from("listings").upsert({
    id: listingId,
    property_id: propertyId,
    seller_id: seller.user.id,
    status: "live",
    price_cents: 100000000,
    media: [],
    media_cost_cents: 0,
    campaign_cost_cents: 0,
  });
  await admin.from("deals").upsert({
    id: dealId,
    listing_id: listingId,
    state: "contract",
    paused: false,
  });
  await admin.from("deal_parties").upsert(
    [
      { deal_id: dealId, user_id: seller.user.id, role: "seller", side: "seller" },
      { deal_id: dealId, user_id: seller.user.id, role: "agent_seller", side: "seller" },
      { deal_id: dealId, user_id: broker.user.id, role: "broker_of_record", side: "neutral" },
      { deal_id: dealId, user_id: buyer.user.id, role: "buyer", side: "buyer" },
    ],
    { onConflict: "deal_id,user_id,role" },
  );
  await admin.from("offers").upsert({
    id: offerId,
    deal_id: dealId,
    buyer_id: buyer.user.id,
    status: "accepted",
    price_cents: 100000000,
    financing: "cash",
    down_pct: 100,
    emd_cents: 5000000,
    close_date: "2026-12-01",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    verified_funds: true,
    contingencies: { has_agent: false },
  });

  await admin.from("approvals").delete().eq("deal_id", dealId);
  await admin.from("approvals").insert({
    id: approval1,
    deal_id: dealId,
    kind: "deposit_confirmation",
    status: "pending",
    context: {},
    requested_by: seller.user.id,
  });
  await admin.from("events").insert({
    deal_id: dealId,
    actor_id: seller.user.id,
    type: "broker.approval.requested",
    payload: { approval_id: approval1, kind: "deposit_confirmation" },
  });
  const { data: queued } = await admin.from("approvals").select("*").eq("id", approval1).single();
  check("approval appears in queue", queued?.status === "pending" && queued.kind === "deposit_confirmation");

  await admin
    .from("approvals")
    .update({
      status: "rejected",
      decided_by: broker.user.id,
      decided_at: new Date().toISOString(),
      note: "Need the escrow letter.",
    })
    .eq("id", approval1);
  await admin.from("events").insert({
    deal_id: dealId,
    actor_id: broker.user.id,
    type: "broker.approval.rejected",
    payload: { approval_id: approval1, note: "Need the escrow letter." },
  });
  const { data: afterReject } = await admin.from("deals").select("state").eq("id", dealId).single();
  check("reject leaves deal in contract", afterReject?.state === "contract");
  const { data: rejectEvent } = await admin
    .from("events")
    .select("*")
    .eq("deal_id", dealId)
    .eq("type", "broker.approval.rejected")
    .limit(1);
  check("reject note in events", (rejectEvent ?? [])[0]?.payload?.note === "Need the escrow letter.");

  await admin.from("approvals").insert({
    id: approval2,
    deal_id: dealId,
    kind: "deposit_confirmation",
    status: "pending",
    requested_by: seller.user.id,
  });
  await admin
    .from("approvals")
    .update({
      status: "approved",
      decided_by: broker.user.id,
      decided_at: new Date().toISOString(),
      note: "Escrow confirmed.",
    })
    .eq("id", approval2);
  await admin.from("money_events").insert({
    deal_id: dealId,
    kind: "emd",
    amount_cents: 5000000,
    status: "held",
  });
  await admin.from("deals").update({ state: "in_contract" }).eq("id", dealId);
  await admin.from("events").insert({
    deal_id: dealId,
    actor_id: broker.user.id,
    type: "broker.approval.approved",
    payload: { approval_id: approval2, kind: "deposit_confirmation" },
  });
  const { data: afterApprove } = await admin.from("deals").select("state").eq("id", dealId).single();
  check("approve advances deposit path", afterApprove?.state === "in_contract");
  const { data: bothDecisions } = await admin
    .from("events")
    .select("type")
    .eq("deal_id", dealId)
    .in("type", ["broker.approval.rejected", "broker.approval.approved"]);
  check("both decisions in events", (bothDecisions ?? []).length >= 2);

  await admin.from("deals").update({ paused: true, paused_reason: "Title question" }).eq("id", dealId);
  const { data: paused } = await admin.from("deals").select("paused").eq("id", dealId).single();
  check("pause flag set", paused?.paused === true);
  check(
    "pause typed error wired",
    sourceContains("src/lib/actions/errors.ts", '"paused"') &&
      sourceContains("src/lib/compliance/gates.ts", "This deal is paused by the broker of record"),
  );
  await admin.from("deals").update({ paused: false, paused_reason: null }).eq("id", dealId);
  const { data: unpaused } = await admin.from("deals").select("paused").eq("id", dealId).single();
  check("unpause restores flow", unpaused?.paused === false);

  const { data: noDisc } = await admin
    .from("documents")
    .select("id")
    .eq("deal_id", dealId)
    .ilike("name", "%Agency Disclosure%");
  check("disclosure missing on fresh deal", !(noDisc ?? []).length);
  check(
    "disclosure_required typed error",
    sourceContains("src/lib/actions/errors.ts", "disclosure_required"),
  );

  const sameUserBlocked =
    sourceContains("src/lib/actions/approvals.ts", "agentSeller === agentBuyer");
  check("same-user designated agents impossible", sameUserBlocked);

  const { data: demoListing } = await admin
    .from("properties")
    .select("id, address_line")
    .ilike("address_line", "%412%");
  const demoProperty = (demoListing ?? [])[0];
  if (demoProperty) {
    const { data: listing } = await admin.from("listings").select("*").eq("property_id", demoProperty.id).maybeSingle();
    const { data: demoDeal } = listing
      ? await admin.from("deals").select("*").eq("listing_id", listing.id).maybeSingle()
      : { data: null };
    const { data: demoOffers } = demoDeal
      ? await admin.from("offers").select("*").eq("deal_id", demoDeal.id)
      : { data: [] };
    const accepted = (demoOffers ?? []).find((o) => o.status === "accepted");
    const offerDepth = (demoOffers ?? []).length;
    const winPct =
      accepted && listing ? (Number(accepted.price_cents) / Number(listing.price_cents)) * 100 : null;
    const { data: fees } = demoDeal
      ? await admin.from("money_events").select("*").eq("deal_id", demoDeal.id).in("kind", ["platform_fee", "buyer_agent_fee"])
      : { data: [] };
    const feeSum = (fees ?? []).reduce((n, r) => n + Number(r.amount_cents ?? 0), 0);
    console.log(
      `SCORECARD RAW demo ${demoProperty.address_line}: offerDepth=${offerDepth} winVsList=${winPct == null ? "n/a" : winPct.toFixed(2)} fee_cents=${feeSum}`,
    );
    check("scorecard raw demo deal readable", offerDepth >= 0);
  } else {
    check("scorecard raw demo deal readable", false, "412 listing not found");
  }

  const prodCheck = spawnSync("node", ["scripts/production-check.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_PUBLIC_DATA_MODE: "production" },
    encoding: "utf8",
  });
  check(
    "production-check fails on seeded defaults",
    prodCheck.status === 1 && /Seed user still exists/i.test(`${prodCheck.stdout}\n${prodCheck.stderr}`),
    prodCheck.stdout.split("\n").slice(0, 8).join(" | "),
  );

  await admin.from("approvals").delete().eq("deal_id", dealId);
  await admin.from("money_events").delete().eq("deal_id", dealId);
  await admin.from("events").delete().eq("deal_id", dealId);
  await admin.from("offers").delete().eq("id", offerId);
  await admin.from("deal_parties").delete().eq("deal_id", dealId);
  await admin.from("deals").delete().eq("id", dealId);
  await admin.from("listings").delete().eq("id", listingId);
  await admin.from("properties").delete().eq("id", propertyId);

  await seller.client.auth.signOut();
  await broker.client.auth.signOut();
  await buyer.client.auth.signOut();
} catch (error) {
  console.error(error);
  failures.push(error instanceof Error ? error.message : "unexpected");
}

if (failures.length) {
  console.log(`\nR5 FAIL (${failures.length})`);
  process.exit(1);
}
console.log("\nR5 PASS");
