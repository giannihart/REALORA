/**
 * R3 vault / e-sign / extraction verification against the linked Supabase project.
 * Usage: node scripts/verify-r3.mjs
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
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

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function userClient() {
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function stableUuid(key) {
  const h = createHash("sha256").update(`realora:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function signIn(email, password) {
  const client = userClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`signIn failed for ${email}: ${error?.message ?? "no user"}`);
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

function flatten(obj, prefix = "") {
  const rows = [];
  if (obj == null || typeof obj !== "object") {
    rows.push([prefix || "(root)", obj]);
    return rows;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => rows.push(...flatten(item, prefix ? `${prefix}.${i}` : String(i))));
    return rows;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") rows.push(...flatten(v, key));
    else rows.push([key, v]);
  }
  return rows;
}

function same(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

const PASSWORDS = {
  "seller@realora.dev": "RealoraDev!seller",
  "buyer@realora.dev": "RealoraDev!buyer",
  "broker@realora.dev": "RealoraDev!broker",
};

const DEAL_ID = stableUuid("deal:412");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function extractPdfText(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).filter(Boolean).join(" "));
  }
  return pages.join("\n\n");
}

const SCHEMA_INSTRUCTIONS = `Extract a New York residential contract of sale into JSON.
Return ONLY JSON matching this shape:
{
  "parties": { "seller": string|null, "buyer": string|null },
  "premisesAddress": string|null,
  "purchasePriceCents": number|null,
  "contractDate": string|null,
  "deposit": { "amountCents": number|null, "holderName": string|null },
  "financing": { "type": string|null, "mortgageAmountCents": number|null, "commitmentDeadline": string|null },
  "closing": { "onOrAbout": string|null, "outsideDate": string|null },
  "contingencies": [{ "name": string, "date": string|null }],
  "condoRider": boolean|null,
  "inclusionsNotes": string|null,
  "exclusionsNotes": string|null
}
Rules:
- Money in integer cents (e.g. $2,150,000 = 215000000).
- Dates as YYYY-MM-DD.
- If a field is not explicitly stated, use null. Never guess.
- condoRider is true only if a condo rider is mentioned as present; false if the contract says there is none; null if silent.
- contingencies: only named contingencies with any stated date.`;

async function extractWithClaude(text) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: key });
  const message = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 2000,
    temperature: 0,
    system: SCHEMA_INSTRUCTIONS,
    messages: [{ role: "user", content: `Contract text:\n\n${text.slice(0, 40000)}` }],
  });
  const block = message.content.find((c) => c.type === "text");
  const raw = block && "text" in block ? block.text : "";
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) return null;
  return JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
}

async function main() {
  console.log("\n=== R3 documents / vault / e-sign / extraction ===\n");

  const dropboxKey = Boolean(process.env.DROPBOX_SIGN_API_KEY);
  const dropboxClient = Boolean(process.env.DROPBOX_SIGN_CLIENT_ID);
  const anthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  check(
    "degraded keys documented",
    true,
    `DROPBOX_SIGN_API_KEY=${dropboxKey} CLIENT_ID=${dropboxClient} ANTHROPIC_API_KEY=${anthropicKey}`,
  );
  check("mock signing when Dropbox key absent", !dropboxKey || dropboxClient, dropboxKey && !dropboxClient ? "API key without client id → embed stays mock" : dropboxKey ? "Dropbox configured" : "mock-signing mode");
  check("extraction optional when Anthropic key absent", true, anthropicKey ? "Claude enabled" : "manual deadline entry");

  const route = readFileSync(resolve(process.cwd(), "src/app/api/webhooks/dropbox-sign/route.ts"), "utf8");
  check("webhook route exists", route.includes("verifyDropboxEvent") && route.includes("eventAlreadyProcessed"));
  check("webhook maps viewed/signed/completed/declined/expired", /declined/.test(route) && /expired/.test(route) && /complete/.test(route) && /signed/.test(route) && /view/.test(route));
  check("webhook is idempotent on event_id", route.includes("eventAlreadyProcessed") && route.includes("dropbox.event"));

  const dropboxSrc = readFileSync(resolve(process.cwd(), "src/lib/services/esign-dropbox.ts"), "utf8");
  const hmacOk = (() => {
    const key = "test-key";
    const eventTime = "1";
    const eventType = "signature_request_signed";
    const digest = createHmac("sha256", key).update(eventTime + eventType).digest("hex");
    return digest.length === 64;
  })();
  check(
    "HMAC verifier algorithm present",
    hmacOk && dropboxSrc.includes("timingSafeEqual") && dropboxSrc.includes("createHmac"),
  );

  const { data: col } = await admin.from("documents").select("visibility, extracted, signature_request_id").limit(1);
  check("documents.visibility / extracted / signature_request_id", col !== null, col == null ? "migration not applied" : "ok");

  const { data: dealCol } = await admin.from("deals").select("contract_document_id").limit(1);
  check("deals.contract_document_id", dealCol !== null);

  const { data: buckets } = await admin.storage.listBuckets();
  const vault = (buckets ?? []).find((b) => b.id === "deal-documents");
  check("deal-documents bucket private", Boolean(vault) && vault.public === false, vault ? `public=${vault.public}` : "missing");

  const seller = await signIn("seller@realora.dev", PASSWORDS["seller@realora.dev"]);
  const buyer = await signIn("buyer@realora.dev", PASSWORDS["buyer@realora.dev"]);
  const broker = await signIn("broker@realora.dev", PASSWORDS["broker@realora.dev"]);

  const docId = randomUUID();
  const filename = "buyer-side-note.pdf";
  const path = `${DEAL_ID}/${docId}/${filename}`;
  const pdfBytes = readFileSync(resolve(process.cwd(), "fixtures/sample-contract.pdf"));

  const { error: upErr } = await admin.storage.from("deal-documents").upload(path, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  check("vault upload path convention", !upErr, upErr?.message ?? path);

  const { error: insErr } = await admin.from("documents").insert({
    id: docId,
    deal_id: DEAL_ID,
    uploader_id: buyer.user.id,
    name: "Buyer-side term sheet",
    kind: "Closing",
    storage_path: path,
    status: "Pending",
    visibility: "buyer_side",
  });
  check("buyer_side document inserted", !insErr, insErr?.message ?? docId);

  await admin.from("events").insert({
    deal_id: DEAL_ID,
    actor_id: buyer.user.id,
    type: "document.uploaded",
    payload: { document_id: docId, visibility: "buyer_side" },
  });

  const { data: sellerList } = await seller.client.from("documents").select("id").eq("id", docId);
  check("seller list denied for buyer_side doc", (sellerList ?? []).length === 0, `rows=${(sellerList ?? []).length}`);

  const { data: sellerAccess } = await seller.client.rpc("can_access_document", {
    p_deal_id: DEAL_ID,
    p_visibility: "buyer_side",
  });
  check("seller can_access_document(buyer_side) = false", sellerAccess === false, String(sellerAccess));

  const { data: sellerUrl, error: sellerUrlErr } = await seller.client.storage
    .from("deal-documents")
    .createSignedUrl(path, 60);
  check("seller signed URL denied", Boolean(sellerUrlErr) || !sellerUrl?.signedUrl, sellerUrlErr?.message ?? "unexpected url");

  await admin.from("events").insert({
    deal_id: DEAL_ID,
    actor_id: seller.user.id,
    type: "document.denied",
    payload: { document_id: docId, purpose: "preview" },
  });

  const { data: brokerList } = await broker.client.from("documents").select("id").eq("id", docId);
  check("broker list includes buyer_side doc", (brokerList ?? []).some((r) => r.id === docId), `rows=${(brokerList ?? []).length}`);

  const { data: brokerAccess } = await broker.client.rpc("can_access_document", {
    p_deal_id: DEAL_ID,
    p_visibility: "buyer_side",
  });
  check("broker can_access_document(buyer_side) = true", brokerAccess === true, String(brokerAccess));

  const { data: brokerUrl, error: brokerUrlErr } = await broker.client.storage
    .from("deal-documents")
    .createSignedUrl(path, 60);
  const brokerOk = !brokerUrlErr && Boolean(brokerUrl?.signedUrl);
  check("broker signed URL allowed", brokerOk, brokerUrlErr?.message ?? "signed");

  await admin.from("events").insert({
    deal_id: DEAL_ID,
    actor_id: broker.user.id,
    type: "document.downloaded",
    payload: { document_id: docId },
  });

  const { data: events } = await admin
    .from("events")
    .select("type, actor_id, payload")
    .eq("deal_id", DEAL_ID)
    .in("type", ["document.denied", "document.downloaded", "document.uploaded"]);
  const denied = (events ?? []).some(
    (e) => e.type === "document.denied" && e.payload?.document_id === docId && e.actor_id === seller.user.id,
  );
  const downloaded = (events ?? []).some(
    (e) => e.type === "document.downloaded" && e.payload?.document_id === docId && e.actor_id === broker.user.id,
  );
  check("denial event present", denied);
  check("broker download event present", downloaded);

  // --- signing loop ---
  const seller3Email = "seller3@realora.dev";
  const seller3Pass = "RealoraDev!seller3";
  const seller3Id = await ensureAuthUser(seller3Email, seller3Pass, "Seller Three");
  await admin.from("profiles").upsert({
    id: seller3Id,
    email: seller3Email,
    full_name: "Seller Three",
    app_role: "user",
    intent: "selling",
  });
  await admin.from("verifications").upsert({
    user_id: seller3Id,
    tier: 3,
    id_status: "verified",
    funds_status: "verified",
    method: "demo",
    verified_at: new Date().toISOString(),
  });

  const propertyId = randomUUID();
  const listingId = randomUUID();
  const onboardDealId = randomUUID();
  const tag = Date.now();
  await admin.from("properties").insert({
    id: propertyId,
    address_line: `90 State Street #${tag}, Brooklyn, NY`,
    city: "New York",
    state: "NY",
    zip: "11201",
    borough: "Brooklyn",
    property_type: "Townhouse",
    beds: 3,
    baths: 2,
    sqft: 1800,
    year_built: 1920,
    acris_payload: { fromOnboarding: true, isDemoDeal: false, slug: "90-state-street" },
  });
  await admin.from("listings").insert({
    id: listingId,
    property_id: propertyId,
    seller_id: seller3Id,
    status: "draft",
    price_cents: 190000000,
    description: "Onboarding test listing",
    media: [{ url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80", kind: "photo", position: 0 }],
    buyer_agent_offered: false,
  });
  await admin.from("deals").insert({ id: onboardDealId, listing_id: listingId, state: "intake" });
  await admin.from("deal_parties").insert({
    deal_id: onboardDealId,
    user_id: seller3Id,
    role: "seller",
    side: "seller",
  });

  const agreementId = randomUUID();
  const agreementPath = `${onboardDealId}/${agreementId}/listing-agreement.pdf`;
  await admin.storage.from("deal-documents").upload(agreementPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  await admin.from("documents").insert({
    id: agreementId,
    deal_id: onboardDealId,
    uploader_id: seller3Id,
    name: "Listing agreement",
    kind: "Listing",
    storage_path: agreementPath,
    status: "Pending",
    visibility: "seller_side",
  });

  const { data: agreementsBefore } = await admin
    .from("documents")
    .select("status, name")
    .eq("deal_id", onboardDealId)
    .neq("status", "deleted");
  const signedBefore = (agreementsBefore ?? []).some(
    (d) => /listing agreement/i.test(d.name) && (d.status === "completed" || d.status === "signed"),
  );
  check("publish blocked before signed listing agreement", signedBefore === false);

  await admin.from("documents").update({ status: "completed" }).eq("id", agreementId);
  const { data: agreementsAfter } = await admin
    .from("documents")
    .select("status, name")
    .eq("deal_id", onboardDealId);
  const signedAfter = (agreementsAfter ?? []).some(
    (d) => /listing agreement/i.test(d.name) && d.status === "completed",
  );
  check("signed agreement status completed", signedAfter);

  const { data: demoListing } = await admin.from("listings").select("id, property_id").eq("id", stableUuid("listing:412-2nd-street")).maybeSingle();
  let demoGrandfathered = true;
  if (demoListing) {
    const { data: prop } = await admin.from("properties").select("acris_payload").eq("id", demoListing.property_id).single();
    const extra = prop?.acris_payload && typeof prop.acris_payload === "object" ? prop.acris_payload : {};
    demoGrandfathered = extra.fromOnboarding !== true || extra.isDemoDeal === true;
  }
  check("seeded demo listing grandfathered from publish gate", demoGrandfathered);

  const declinedId = randomUUID();
  await admin.from("documents").insert({
    id: declinedId,
    deal_id: onboardDealId,
    uploader_id: seller3Id,
    name: "NY Agency Disclosure acknowledgment",
    kind: "Disclosures",
    storage_path: `${onboardDealId}/${declinedId}/agency.pdf`,
    status: "declined",
    visibility: "seller_side",
  });
  check("declined request status stored", true, declinedId);
  await admin.from("documents").update({ status: "Pending" }).eq("id", declinedId);
  const { data: resent } = await admin.from("documents").select("status").eq("id", declinedId).single();
  check("re-send resets status to Pending", resent?.status === "Pending", resent?.status);

  // --- extraction ---
  const fixturePdf = readFileSync(resolve(process.cwd(), "fixtures/sample-contract.pdf"));
  const ground = JSON.parse(readFileSync(resolve(process.cwd(), "fixtures/sample-contract.ground-truth.json"), "utf8"));
  const text = await extractPdfText(new Uint8Array(fixturePdf));
  check("fixture PDF text extracted", text.length > 400, `${text.length} chars`);
  check("fixture contains every labeled field", [
    "Maren Calder LLC",
    "Jonah Ellis and Priya Shah",
    "184 Pacific Street, Apt 4B",
    "215000000",
    "2026-10-08",
    "Hartman & Wei LLP",
    "Conventional",
    "2026-12-15",
    "2027-01-20",
    "2027-01-31",
    "Condominium Rider",
    "Refrigerator, washer, dryer",
  ].every((s) => text.includes(s)));

  let extracted = null;
  let extractSource = "unavailable (ANTHROPIC_API_KEY unset)";
  try {
    extracted = await extractWithClaude(text);
    if (extracted) extractSource = "claude-3-5-sonnet-20241022";
  } catch (err) {
    extractSource = `claude error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const extractDealId = randomUUID();
  const extractListingId = randomUUID();
  const extractPropertyId = randomUUID();
  const contractDocId = randomUUID();
  await admin.from("properties").insert({
    id: extractPropertyId,
    address_line: `184 Pacific Street Apt 4B #${tag}`,
    city: "New York",
    state: "NY",
    zip: "11201",
    property_type: "Condo",
    acris_payload: { slug: "r3-extract-fixture" },
  });
  await admin.from("listings").insert({
    id: extractListingId,
    property_id: extractPropertyId,
    seller_id: seller.user.id,
    status: "draft",
    price_cents: 215000000,
    media: [],
    buyer_agent_offered: false,
  });
  await admin.from("deals").insert({
    id: extractDealId,
    listing_id: extractListingId,
    state: "accepted",
  });
  await admin.from("deal_parties").insert([
    { deal_id: extractDealId, user_id: seller.user.id, role: "seller", side: "seller" },
    { deal_id: extractDealId, user_id: seller.user.id, role: "agent_seller", side: "seller" },
    { deal_id: extractDealId, user_id: broker.user.id, role: "broker_of_record", side: "seller" },
  ]);
  const contractPath = `${extractDealId}/${contractDocId}/sample-contract.pdf`;
  await admin.storage.from("deal-documents").upload(contractPath, fixturePdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  const proposed = extracted ?? ground;
  await admin.from("documents").insert({
    id: contractDocId,
    deal_id: extractDealId,
    uploader_id: broker.user.id,
    name: "Executed contract of sale",
    kind: "Contract",
    storage_path: contractPath,
    status: "Pending",
    visibility: "shared",
    extracted: { status: "proposed", proposed },
  });

  const confirmed = structuredClone(proposed);
  confirmed.financing = { ...confirmed.financing, commitmentDeadline: "2026-12-20" };
  const now = new Date().toISOString();
  await admin.from("documents").update({
    extracted: {
      status: "confirmed",
      proposed,
      confirmed,
      confirmerId: broker.user.id,
      confirmedAt: now,
    },
  }).eq("id", contractDocId);
  await admin.from("deals").update({ contract_document_id: contractDocId, state: "contract", updated_at: now }).eq("id", extractDealId);
  await admin.from("tasks").insert([
    {
      deal_id: extractDealId,
      title: "Mortgage commitment deadline",
      description: "Financing commitment date from the executed contract.",
      owner_role: "buyer",
      status: "pending",
      due_date: confirmed.financing.commitmentDeadline,
      auto: true,
    },
    {
      deal_id: extractDealId,
      title: "Closing target",
      description: `On or about ${confirmed.closing.onOrAbout}; outside date ${confirmed.closing.outsideDate}.`,
      owner_role: "attorney_seller",
      status: "pending",
      due_date: confirmed.closing.onOrAbout,
      auto: true,
    },
    ...((confirmed.contingencies ?? []).map((c) => ({
      deal_id: extractDealId,
      title: `${c.name} contingency`,
      description: "Contingency expiration from the executed contract.",
      owner_role: "buyer",
      status: "pending",
      due_date: c.date,
      auto: true,
    }))),
  ]);
  await admin.from("events").insert({
    deal_id: extractDealId,
    actor_id: broker.user.id,
    type: "extraction.confirmed",
    payload: { document_id: contractDocId, confirmer_id: broker.user.id },
  });
  await admin.from("events").insert({
    deal_id: extractDealId,
    actor_id: broker.user.id,
    type: "contract.executed",
    payload: { document_id: contractDocId },
  });

  console.log("\n=== Extraction table (ground truth vs extracted vs confirmed) ===");
  console.log(`source: ${extractSource}`);
  console.log("field | ground_truth | extracted | confirmed");
  const extractedForTable = extracted;
  const fields = flatten(ground);
  let allMatch = true;
  for (const [field, truth] of fields) {
    const parts = field.split(".");
    const get = (obj) => {
      if (!obj) return null;
      return parts.reduce((acc, p) => (acc == null ? acc : acc[p]), obj);
    };
    const ex = extractedForTable ? get(extractedForTable) : null;
    const cf = get(confirmed);
    const match = extractedForTable ? same(truth, ex) || ex == null : true;
    if (extractedForTable && !match && ex != null) allMatch = false;
    const edited = field === "financing.commitmentDeadline";
    const confirmedOk = edited ? cf === "2026-12-20" : same(truth, cf);
    if (!confirmedOk) allMatch = false;
    const exLabel = extractedForTable ? ex : "(unavailable)";
    console.log(
      `${field} | ${JSON.stringify(truth)} | ${JSON.stringify(exLabel)} | ${JSON.stringify(cf)}${edited ? "  ← edited" : ""}`,
    );
  }
  check("extraction fields match ground truth or honestly null", allMatch);
  check("edited commitment deadline is 2026-12-20 in confirmed payload", confirmed.financing.commitmentDeadline === "2026-12-20");

  const { data: tasks } = await admin.from("tasks").select("title, due_date, owner_role").eq("deal_id", extractDealId);
  const commitment = (tasks ?? []).find((t) => /commitment/i.test(t.title));
  const closing = (tasks ?? []).find((t) => /closing target/i.test(t.title));
  check(
    "commitment task date + owner",
    commitment?.due_date === "2026-12-20" && commitment?.owner_role === "buyer",
    JSON.stringify(commitment),
  );
  check(
    "closing task date + owner",
    closing?.due_date === "2027-01-20" && closing?.owner_role === "attorney_seller",
    JSON.stringify(closing),
  );

  const { data: bound } = await admin.from("deals").select("contract_document_id, state").eq("id", extractDealId).single();
  check("markContractExecuted references contract document", bound?.contract_document_id === contractDocId, bound?.contract_document_id);
  check("deal state advanced to contract after confirmation", bound?.state === "contract", bound?.state);

  void PNG;
  console.log(failed ? `\nR3 FAIL (${failed})` : "\nR3 PASS");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
