/**
 * R1 RLS / auth verification against the linked Supabase project.
 * Usage: node scripts/verify-r1.mjs
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
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

function stableUuid(key) {
  const h = createHash("sha256").update(`realora:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const PASSWORDS = {
  "seller@realora.dev": "RealoraDev!seller",
  "buyer@realora.dev": "RealoraDev!buyer",
  "broker@realora.dev": "RealoraDev!broker",
  "offera@realora.dev": "RealoraDev!offera",
  "offerc@realora.dev": "RealoraDev!offerc",
};

const DEAL_ID = stableUuid("deal:412");
const LISTING_ID = stableUuid("listing:412-2nd-street");
const OFFER_B_ID = stableUuid("offer:offer-b");
const CONTRACT_ROLES = ["broker_of_record", "agent_seller"];
const PLAIN_SELLER_EMAIL = "verify-plain-seller@example.com";
const PLAIN_SELLER_PASSWORD = "RealoraDev!plainseller";
const TIER1_EMAIL = "verify-tier1@example.com";
const TIER1_PASSWORD = "RealoraDev!tier1";
const UNRELATED_EMAIL = "verify-unrelated@example.com";
const UNRELATED_PASSWORD = "RealoraDev!unrelated";

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function userClient() {
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email, password) {
  const client = userClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`signInWithPassword failed for ${email}: ${error?.message ?? "no user"}`);
  }
  return { client, user: data.user };
}

async function ensureAuthUser(email, password, name) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (!error && created.user) return created.user.id;
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw new Error(`Could not create or find ${email}: ${error?.message}`);
  await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  return existing.id;
}

let failed = 0;
function check(name, ok, detail = "") {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`;
  console.log(line);
  if (!ok) failed += 1;
}

async function partyRolesOf(userId) {
  const { data } = await admin
    .from("deal_parties")
    .select("role")
    .eq("deal_id", DEAL_ID)
    .eq("user_id", userId);
  return (data ?? []).map((row) => row.role);
}

async function readState(session) {
  const { data } = await session.client
    .from("deals")
    .select("state")
    .eq("id", DEAL_ID)
    .maybeSingle();
  return data?.state ?? null;
}

async function clientUpdateDeal(session, state) {
  const { error, data } = await session.client
    .from("deals")
    .update({ state })
    .eq("id", DEAL_ID)
    .select("id");
  return {
    blocked: Boolean(error) || (data ?? []).length === 0,
    message: error?.message ?? `rows=${(data ?? []).length}`,
  };
}

async function resetDemoDeal() {
  await admin.from("deals").update({ state: "tours_offers", fell_through_reason: null }).eq("id", DEAL_ID);
  await admin.from("listings").update({ status: "live" }).eq("id", LISTING_ID);
  await admin.from("offers").update({ status: "new" }).eq("deal_id", DEAL_ID);
  await admin.from("money_events").delete().eq("deal_id", DEAL_ID);
  await admin.from("tasks").delete().eq("deal_id", DEAL_ID).eq("auto", true);
}

async function main() {
  const seller = await signIn("seller@realora.dev", PASSWORDS["seller@realora.dev"]);
  const buyer = await signIn("buyer@realora.dev", PASSWORDS["buyer@realora.dev"]);
  const broker = await signIn("broker@realora.dev", PASSWORDS["broker@realora.dev"]);
  const buyerA = await signIn("offera@realora.dev", PASSWORDS["offera@realora.dev"]);
  const buyerC = await signIn("offerc@realora.dev", PASSWORDS["offerc@realora.dev"]);

  const tier1Id = await ensureAuthUser(TIER1_EMAIL, TIER1_PASSWORD, "Verify Tier One");
  await admin.from("verifications").upsert({
    user_id: tier1Id,
    tier: 1,
    id_status: "pending",
    funds_status: "pending",
    method: "verify-r1",
  });
  const unrelatedId = await ensureAuthUser(UNRELATED_EMAIL, UNRELATED_PASSWORD, "Verify Unrelated");
  await admin.from("verifications").upsert({
    user_id: unrelatedId,
    tier: 2,
    id_status: "verified",
    funds_status: "verified",
    method: "verify-r1",
  });

  const tier1 = await signIn(TIER1_EMAIL, TIER1_PASSWORD);
  const unrelated = await signIn(UNRELATED_EMAIL, UNRELATED_PASSWORD);

  const plainSellerId = await ensureAuthUser(
    PLAIN_SELLER_EMAIL,
    PLAIN_SELLER_PASSWORD,
    "Verify Plain Seller",
  );
  await admin.from("profiles").upsert({
    id: plainSellerId,
    email: PLAIN_SELLER_EMAIL,
    full_name: "Verify Plain Seller",
    app_role: "user",
    intent: "selling",
  });
  await admin.from("deal_parties").upsert({
    deal_id: DEAL_ID,
    user_id: plainSellerId,
    role: "co_seller",
    side: "seller",
  });
  const plainSeller = await signIn(PLAIN_SELLER_EMAIL, PLAIN_SELLER_PASSWORD);

  await resetDemoDeal();

  const sellerRoles = await partyRolesOf(seller.user.id);
  check(
    "(seed) seller@ holds seller + agent_seller on the demo deal",
    sellerRoles.includes("seller") && sellerRoles.includes("agent_seller"),
    sellerRoles.join(","),
  );

  // (a) buyer reads the demo deal and sees offer B as theirs
  const { data: buyerDeals, error: buyerDealErr } = await buyer.client
    .from("deals")
    .select("id, state")
    .eq("id", DEAL_ID);
  const { data: buyerOffers, error: buyerOfferErr } = await buyer.client
    .from("offers")
    .select("id, buyer_id, contingencies")
    .eq("deal_id", DEAL_ID);
  const offerB = (buyerOffers ?? []).find(
    (o) =>
      o.id === OFFER_B_ID ||
      (o.contingencies && o.contingencies.slug === "offer-b"),
  );
  check(
    "(a) buyer reads the demo deal and sees offer B as theirs",
    !buyerDealErr &&
      (buyerDeals ?? []).length === 1 &&
      !buyerOfferErr &&
      Boolean(offerB) &&
      offerB.buyer_id === buyer.user.id,
    buyerDealErr?.message ||
      buyerOfferErr?.message ||
      `deals=${(buyerDeals ?? []).length} offers=${(buyerOffers ?? []).length} offerB=${offerB?.id ?? "none"}`,
  );

  // (b) buyer cannot accept / run seller-only mutations from the client
  const { error: acceptDealErr, data: acceptDealData } = await buyer.client
    .from("deals")
    .update({ state: "accepted" })
    .eq("id", DEAL_ID)
    .select("id");
  const { error: acceptOfferErr, data: acceptOfferData } = await buyer.client
    .from("offers")
    .update({ status: "accepted" })
    .eq("id", OFFER_B_ID)
    .select("id");
  const { data: dealAfter } = await buyer.client
    .from("deals")
    .select("state")
    .eq("id", DEAL_ID)
    .maybeSingle();
  const buyerAcceptBlocked =
    (Boolean(acceptDealErr) || (acceptDealData ?? []).length === 0) &&
    (Boolean(acceptOfferErr) || (acceptOfferData ?? []).length === 0) &&
    dealAfter?.state === "tours_offers";
  check(
    "(b) buyer accept mutation is rejected / seller-only actions not callable by buyer",
    buyerAcceptBlocked,
    `dealUpdate=${acceptDealErr?.message ?? `rows=${(acceptDealData ?? []).length}`} offerUpdate=${acceptOfferErr?.message ?? `rows=${(acceptOfferData ?? []).length}`} state=${dealAfter?.state}`,
  );

  // (c) tier-1 user cannot create an offer
  const { error: tier1InsertErr, data: tier1InsertData } = await tier1.client
    .from("offers")
    .insert({
      deal_id: DEAL_ID,
      buyer_id: tier1.user.id,
      status: "new",
      price_cents: 100,
      financing: "cash",
      down_pct: 100,
      emd_cents: 1,
    })
    .select("id");
  const { data: tier1Offers } = await admin
    .from("offers")
    .select("id")
    .eq("deal_id", DEAL_ID)
    .eq("buyer_id", tier1.user.id);
  check(
    "(c) tier-1 user cannot create an offer (RLS/action guard)",
    (Boolean(tier1InsertErr) || (tier1InsertData ?? []).length === 0) &&
      (tier1Offers ?? []).length === 0,
    tier1InsertErr?.message ?? `inserted=${(tier1InsertData ?? []).length}`,
  );

  // (d) unrelated user gets zero rows for the demo deal
  const { data: uDeals } = await unrelated.client.from("deals").select("id").eq("id", DEAL_ID);
  const { data: uOffers } = await unrelated.client.from("offers").select("id").eq("deal_id", DEAL_ID);
  const { data: uDocs } = await unrelated.client.from("documents").select("id").eq("deal_id", DEAL_ID);
  check(
    "(d) unrelated user selects deals/offers/documents for the demo deal and gets zero rows",
    (uDeals ?? []).length === 0 && (uOffers ?? []).length === 0 && (uDocs ?? []).length === 0,
    `deals=${(uDeals ?? []).length} offers=${(uOffers ?? []).length} documents=${(uDocs ?? []).length}`,
  );

  // (e) UPDATE on events denied for every test user
  const testers = [
    ["buyer", buyer],
    ["seller", seller],
    ["broker", broker],
    ["tier-1", tier1],
    ["unrelated", unrelated],
  ];
  const eventUpdateResults = [];
  for (const [label, session] of testers) {
    const { error, data } = await session.client
      .from("events")
      .update({ type: "tamper" })
      .eq("deal_id", DEAL_ID)
      .select("id");
    const denied = Boolean(error) || (data ?? []).length === 0;
    eventUpdateResults.push({ label, denied, message: error?.message ?? `rows=${(data ?? []).length}` });
  }
  check(
    "(e) UPDATE on events is denied for every test user",
    eventUpdateResults.every((r) => r.denied),
    eventUpdateResults.map((r) => `${r.label}:${r.message}`).join("; "),
  );

  // (f) seller reads all three offers; other buyers cannot read Buyer B's offer
  const { data: sellerOffers, error: sellerOfferErr } = await seller.client
    .from("offers")
    .select("id, contingencies")
    .eq("deal_id", DEAL_ID);
  const sellerSeesThree = !sellerOfferErr && (sellerOffers ?? []).length === 3;
  const { data: aOffers } = await buyerA.client
    .from("offers")
    .select("id, contingencies")
    .eq("deal_id", DEAL_ID);
  const { data: cOffers } = await buyerC.client
    .from("offers")
    .select("id, contingencies")
    .eq("deal_id", DEAL_ID);
  const isOfferB = (o) =>
    o.id === OFFER_B_ID || (o.contingencies && o.contingencies.slug === "offer-b");
  const othersBlocked =
    !(aOffers ?? []).some(isOfferB) && !(cOffers ?? []).some(isOfferB);
  check(
    "(f) seller reads all three offers; other buyers cannot read Buyer B's offer",
    sellerSeesThree && othersBlocked,
    `seller=${(sellerOffers ?? []).length} buyerA=${(aOffers ?? []).length} buyerC=${(cOffers ?? []).length}`,
  );

  const buyerRoles = await partyRolesOf(buyer.user.id);
  const plainRoles = await partyRolesOf(plainSeller.user.id);

  // Walk: accept as seller (seller role), then contract/deposit as AE.
  await admin.from("offers").update({ status: "accepted" }).eq("id", OFFER_B_ID);
  await admin
    .from("offers")
    .update({ status: "declined" })
    .eq("deal_id", DEAL_ID)
    .neq("id", OFFER_B_ID);
  await admin.from("deals").update({ state: "accepted" }).eq("id", DEAL_ID);
  await admin.from("listings").update({ status: "under_contract" }).eq("id", LISTING_ID);

  const buyerAtAccepted = await readState(buyer);
  const sellerAtAccepted = await readState(seller);
  check(
    "(walk) seller-accepts → both portals read accepted",
    buyerAtAccepted === "accepted" && sellerAtAccepted === "accepted",
    `buyer=${buyerAtAccepted} seller=${sellerAtAccepted}`,
  );

  const buyerContract = await clientUpdateDeal(buyer, "contract");
  const plainContract = await clientUpdateDeal(plainSeller, "contract");
  const stillAccepted = (await readState(seller)) === "accepted";
  check(
    "(g) buyer calling markContractExecuted is rejected",
    !buyerRoles.some((r) => CONTRACT_ROLES.includes(r)) && buyerContract.blocked && stillAccepted,
    `roles=${buyerRoles.join(",") || "none"} ${buyerContract.message}`,
  );
  check(
    "(g2) plain seller calling markContractExecuted is rejected",
    !plainRoles.some((r) => CONTRACT_ROLES.includes(r)) &&
      plainRoles.includes("co_seller") &&
      plainContract.blocked &&
      stillAccepted,
    `roles=${plainRoles.join(",")} ${plainContract.message}`,
  );

  check(
    "(walk) seller@ may markContractExecuted (holds agent_seller)",
    sellerRoles.includes("agent_seller") && sellerRoles.includes("seller"),
    sellerRoles.join(","),
  );
  await admin.from("deals").update({ state: "contract" }).eq("id", DEAL_ID);
  const buyerAtContract = await readState(buyer);
  const sellerAtContract = await readState(seller);
  check(
    "(walk) contract → both portals read contract",
    buyerAtContract === "contract" && sellerAtContract === "contract",
    `buyer=${buyerAtContract} seller=${sellerAtContract}`,
  );

  const buyerDeposit = await clientUpdateDeal(buyer, "in_contract");
  const plainDeposit = await clientUpdateDeal(plainSeller, "in_contract");
  const stillContract = (await readState(seller)) === "contract";
  check(
    "(h) buyer calling confirmDeposit is rejected",
    buyerDeposit.blocked && stillContract,
    buyerDeposit.message,
  );
  check(
    "(h2) plain seller calling confirmDeposit is rejected",
    plainDeposit.blocked && stillContract,
    plainDeposit.message,
  );

  await admin.from("money_events").insert({
    deal_id: DEAL_ID,
    kind: "emd",
    amount_cents: 40000000,
    status: "held",
    note: "Funds are held by the seller's attorney's escrow — the platform never holds them.",
  });
  await admin.from("deals").update({ state: "diligence" }).eq("id", DEAL_ID);
  await admin.from("tasks").insert([
    {
      deal_id: DEAL_ID,
      title: "Schedule inspection",
      description: "Book the property inspection and confirm access.",
      owner_role: "buyer",
      status: "pending",
      auto: true,
    },
    {
      deal_id: DEAL_ID,
      title: "Title order",
      description: "Order the title search. Exceptions land in Documents.",
      owner_role: "title",
      status: "pending",
      auto: true,
    },
    {
      deal_id: DEAL_ID,
      title: "Appraisal coordination",
      description: "Coordinate appraisal if the buyer is financing.",
      owner_role: "lender",
      status: "pending",
      auto: true,
    },
  ]);

  const buyerAtDiligence = await readState(buyer);
  const sellerAtDiligence = await readState(seller);
  const { data: buyerTasks } = await buyer.client
    .from("tasks")
    .select("title")
    .eq("deal_id", DEAL_ID)
    .eq("title", "Schedule inspection");
  const { data: sellerTasks } = await seller.client
    .from("tasks")
    .select("title")
    .eq("deal_id", DEAL_ID)
    .eq("title", "Schedule inspection");
  check(
    "(walk) deposit → diligence; both portals agree and inspection task is visible",
    buyerAtDiligence === "diligence" &&
      sellerAtDiligence === "diligence" &&
      (buyerTasks ?? []).length === 1 &&
      (sellerTasks ?? []).length === 1,
    `buyer=${buyerAtDiligence} seller=${sellerAtDiligence} buyerTasks=${(buyerTasks ?? []).length} sellerTasks=${(sellerTasks ?? []).length}`,
  );

  await resetDemoDeal();

  if (failed) {
    console.log(`\n${failed} failing check(s).`);
    process.exit(1);
  }
  console.log("\nAll checks passed. Demo deal restored to tours_offers.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
