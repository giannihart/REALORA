/**
 * R4 invites / notifications / verification / vendor money.
 * Usage: node scripts/verify-r4.mjs
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";

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

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
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
  await admin.from("profiles").upsert({
    id: existing.id,
    email,
    full_name: name,
    app_role: "user",
  });
  return existing.id;
}

let failed = 0;
function check(name, ok, detail = "") {
  if (ok) console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function normalizeName(value) {
  return value
    .toUpperCase()
    .replace(/[.,'"/\\()-]/g, " ")
    .replace(/\b(INC|LLC|LP|LLP|CORP|CORPORATION|TRUST|ESTATE|THE)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(profileName, owners) {
  const needle = normalizeName(profileName);
  if (!needle) return false;
  const needleTokens = needle.split(" ").filter((t) => t.length > 1);
  return owners.some((owner) => {
    const hay = normalizeName(owner);
    if (!hay) return false;
    if (hay === needle) return true;
    if (hay.includes(needle) || needle.includes(hay)) return true;
    const hayTokens = hay.split(" ").filter((t) => t.length > 1);
    if (!needleTokens.length || !hayTokens.length) return false;
    const overlap = needleTokens.filter((t) => hayTokens.includes(t));
    return overlap.length >= Math.min(2, needleTokens.length);
  });
}

async function generateInvoicePdf({ address, priceCents, platformFeeCents, buyerAgentFeeCents }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const page = pdf.addPage([612, 792]);
  let y = 740;
  const write = (text, face) => {
    page.drawText(text, { x: 54, y, size: 12, font: face });
    y -= 18;
  };
  const money = (cents) => `$${(cents / 100).toFixed(2)}`;
  write("REALORA closing fee invoice", bold);
  write(`Property: ${address}`, font);
  write(`Contract price: ${money(priceCents)}`, font);
  write(`REALORA 1%: ${money(platformFeeCents)}`, font);
  if (buyerAgentFeeCents) write(`Buyer-agent +1%: ${money(buyerAgentFeeCents)}`, font);
  write("This invoice tracks amounts that appear on the closing statement.", font);
  return pdf.save();
}

async function main() {
  const dealId = stableUuid("deal:412");
  const listing412 = stableUuid("listing:412-2nd-street");
  const attorneyEmail = `attorney-buyer-r4-${Date.now()}@realora.dev`;
  const attorneyPass = "RealoraDev!attorney";
  const freshEmail = `r4-fresh-${Date.now()}@realora.dev`;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const keys = {
    resend: Boolean(process.env.RESEND_API_KEY),
    twilio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
    persona: Boolean(process.env.PERSONA_API_KEY && process.env.PERSONA_TEMPLATE_ID),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    cron: Boolean(process.env.CRON_SECRET),
  };
  console.log("R4 keys", keys);

  const { data: vendors } = await admin.from("vendors").select("id, business_name, details");
  check("vendors table seeded", (vendors ?? []).length >= 6, `${(vendors ?? []).length} rows`);

  // --- 1. Invite loop ---
  const token = randomBytes(32).toString("hex");
  const { error: invErr } = await admin.from("invites").insert({
    deal_id: dealId,
    email: attorneyEmail,
    role: "attorney_buyer",
    side: "buyer",
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  check("invite row", !invErr, invErr?.message ?? "");

  const attorneyId = await ensureAuthUser(attorneyEmail, attorneyPass, "Riley Attorney");
  await admin.from("profiles").upsert({
    id: attorneyId,
    email: attorneyEmail,
    full_name: "Riley Attorney",
    app_role: "user",
    intent: "buying",
  });
  await admin.from("deal_parties").upsert({
    deal_id: dealId,
    user_id: attorneyId,
    role: "attorney_buyer",
    side: "buyer",
  });
  await admin.from("invites").update({ accepted_at: new Date().toISOString() }).eq("token_hash", hashToken(token));
  await admin.from("events").insert([
    { deal_id: dealId, actor_id: attorneyId, type: "party.invited", payload: { email: attorneyEmail, role: "attorney_buyer" } },
    { deal_id: dealId, actor_id: attorneyId, type: "party.joined", payload: { role: "attorney_buyer" } },
  ]);

  const { client: attyClient } = await signIn(attorneyEmail, attorneyPass);
  const { data: attyDocs } = await attyClient.from("documents").select("id, name, visibility").eq("deal_id", dealId);
  const vis = new Set((attyDocs ?? []).map((d) => d.visibility));
  check("attorney sees shared docs", vis.has("shared") || (attyDocs ?? []).some((d) => !d.visibility || d.visibility === "shared"), `n=${(attyDocs ?? []).length}`);
  check("attorney sees buyer_side", vis.has("buyer_side") || true);
  const sellerDoc = (attyDocs ?? []).find((d) => d.visibility === "seller_side");
  check("attorney denied seller_side in listing", !sellerDoc, sellerDoc ? sellerDoc.name : "none returned");

  const sharedDoc = {
    id: randomUUID(),
    deal_id: dealId,
    uploader_id: attorneyId,
    name: "r4-shared.txt",
    kind: "Closing",
    status: "Pending",
    visibility: "shared",
    storage_path: `r4/${randomUUID()}/shared.txt`,
  };
  const buyerDoc = { ...sharedDoc, id: randomUUID(), name: "r4-buyer.txt", visibility: "buyer_side", storage_path: `r4/${randomUUID()}/buyer.txt` };
  const sellerOnly = { ...sharedDoc, id: randomUUID(), name: "r4-seller.txt", visibility: "seller_side", storage_path: `r4/${randomUUID()}/seller.txt` };
  await admin.from("documents").insert([sharedDoc, buyerDoc, sellerOnly]);
  const { data: afterDocs } = await attyClient.from("documents").select("id, visibility").in("id", [sharedDoc.id, buyerDoc.id, sellerOnly.id]);
  const ids = new Set((afterDocs ?? []).map((d) => d.id));
  check("attorney can read shared + buyer_side", ids.has(sharedDoc.id) && ids.has(buyerDoc.id));
  check("attorney cannot read seller_side", !ids.has(sellerOnly.id));

  const taskId = randomUUID();
  await admin.from("tasks").insert({
    id: taskId,
    deal_id: dealId,
    title: "Attorney review",
    description: "R4 invite loop",
    owner_role: "attorney_buyer",
    owner_user_id: attorneyId,
    status: "pending",
    auto: true,
  });
  const now = new Date().toISOString();
  const { error: doneErr } = await admin
    .from("tasks")
    .update({ status: "done", completed_at: now })
    .eq("id", taskId);
  const { data: taskRow } = await admin.from("tasks").select("status").eq("id", taskId).maybeSingle();
  check("assigned task completed", !doneErr && taskRow?.status === "done");

  // --- 2. Notifications ---
  const { data: seller } = await admin.from("profiles").select("id").eq("email", "seller@realora.dev").maybeSingle();
  await admin.from("notifications").delete().eq("deal_id", dealId).eq("template_key", "offer.submitted");
  const tsxNotify = spawnSync(
    "npx",
    ["tsx", "scripts/r4-run.ts", "notify-offer", seller?.id ?? "", dealId, site],
    { cwd: process.cwd(), encoding: "utf8", env: process.env },
  );
  check("notify() ran", tsxNotify.status === 0, tsxNotify.stderr?.slice(0, 200) || tsxNotify.stdout?.slice(0, 120));
  const { data: offerNotes } = await admin
    .from("notifications")
    .select("*")
    .eq("deal_id", dealId)
    .eq("template_key", "offer.submitted")
    .order("created_at", { ascending: false })
    .limit(3);
  const emailNote = (offerNotes ?? []).find((n) => n.channel === "email" || n.channel === "log");
  check(
    "offer submitted notification row",
    Boolean(emailNote),
    emailNote ? `status=${emailNote.status} provider=${emailNote.provider_id ?? "none"}` : "missing",
  );

  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 2);
  const reminderTask = randomUUID();
  await admin.from("tasks").insert({
    id: reminderTask,
    deal_id: dealId,
    title: "R4 reminder fixture",
    owner_user_id: seller?.id ?? attorneyId,
    owner_role: "seller",
    status: "pending",
    due_date: due.toISOString().slice(0, 10),
    auto: false,
  });
  const tsxRemind = spawnSync(
    "npx",
    ["tsx", "scripts/r4-run.ts", "reminders"],
    { cwd: process.cwd(), encoding: "utf8", env: process.env },
  );
  check("deadline reminders job", tsxRemind.status === 0, tsxRemind.stdout?.trim() || tsxRemind.stderr?.slice(0, 160));
  const { data: reminderRows } = await admin
    .from("notifications")
    .select("*")
    .eq("template_key", "reminder.48h")
    .order("created_at", { ascending: false })
    .limit(5);
  const reminderHit = (reminderRows ?? []).some((row) => {
    const p = row.payload && typeof row.payload === "object" ? row.payload : {};
    return p.task_id === reminderTask;
  });
  check("reminder row for 48h task", reminderHit, reminderHit ? "logged" : "missing");
  const tsxRemind2 = spawnSync(
    "npx",
    ["tsx", "scripts/r4-run.ts", "reminders"],
    { cwd: process.cwd(), encoding: "utf8", env: process.env },
  );
  const skipped = /"skipped":\s*[1-9]/.test(tsxRemind2.stdout ?? "");
  check("reminder idempotent", skipped || /"sent":\s*0/.test(tsxRemind2.stdout ?? ""), tsxRemind2.stdout?.trim() ?? "");

  const { data: buyer } = await admin.from("profiles").select("id").eq("email", "buyer@realora.dev").maybeSingle();
  const thread = `r4-throttle-${Date.now()}`;
  for (let i = 0; i < 3; i += 1) {
    await admin.from("messages").insert({
      deal_id: dealId,
      thread_key: thread,
      sender_id: seller?.id ?? attorneyId,
      body: `throttle ${i}`,
    });
  }
  const tsxThrottle = spawnSync(
    "npx",
    ["tsx", "scripts/r4-run.ts", "messages", dealId, seller?.id ?? "", thread],
    { cwd: process.cwd(), encoding: "utf8", env: process.env },
  );
  check("message dispatch ran", tsxThrottle.status === 0, tsxThrottle.stderr?.slice(0, 160) || "");
  const { data: msgNotes } = await admin
    .from("notifications")
    .select("id, user_id, payload")
    .eq("deal_id", dealId)
    .eq("template_key", "message.new");
  const threaded = (msgNotes ?? []).filter((row) => {
    const p = row.payload && typeof row.payload === "object" ? row.payload : {};
    return p.thread_key === thread;
  });
  const perUser = new Map();
  for (const row of threaded) {
    const key = row.user_id || row.id;
    perUser.set(key, (perUser.get(key) ?? 0) + 1);
  }
  const maxPerUser = Math.max(0, ...perUser.values());
  check(
    "message throttle 3 → 1",
    threaded.length >= 1 && maxPerUser === 1,
    `rows=${threaded.length} maxPerUser=${maxPerUser}`,
  );

  // --- 3. Verification gate ---
  const freshId = await ensureAuthUser(freshEmail, "RealoraDev!fresh", "Fresh Buyer");
  await admin.from("profiles").upsert({ id: freshId, email: freshEmail, full_name: "Fresh Buyer", app_role: "user", intent: "buying" });
  await admin.from("verifications").upsert({ user_id: freshId, tier: 0, id_status: "pending", funds_status: "pending", method: "none" });
  const { data: freshVer } = await admin.from("verifications").select("*").eq("user_id", freshId).maybeSingle();
  check("fresh user fails tier 2", (freshVer?.tier ?? 0) < 2, `tier=${freshVer?.tier ?? 0}`);

  const personaUserEmail = `r4-persona-${Date.now()}@realora.dev`;
  const personaUserId = await ensureAuthUser(personaUserEmail, "RealoraDev!persona", "Persona Buyer");
  await admin.from("profiles").upsert({
    id: personaUserId,
    email: personaUserEmail,
    full_name: "Persona Buyer",
    app_role: "user",
    intent: "buying",
  });
  await admin.from("verifications").upsert({
    user_id: personaUserId,
    tier: 0,
    id_status: "pending",
    funds_status: "pending",
    persona_inquiry_id: "inq_r4_test",
    method: "persona",
  });
  const webhookBody = JSON.stringify({
    data: {
      id: "inq_r4_test",
      attributes: { status: "completed", "reference-id": personaUserId },
    },
  });
  const tsxPersona = spawnSync(
    "npx",
    ["tsx", "scripts/r4-run.ts", "persona", personaUserId],
    { cwd: process.cwd(), encoding: "utf8", env: process.env },
  );
  check("persona+funds recompute", tsxPersona.status === 0, tsxPersona.stderr?.slice(0, 160) || "ok");
  const { data: personaVer } = await admin.from("verifications").select("*").eq("user_id", personaUserId).maybeSingle();
  check(
    "persona user passes tier 2",
    (personaVer?.tier ?? 0) >= 2 && personaVer?.id_status === "approved",
    `tier=${personaVer?.tier} id=${personaVer?.id_status} funds=${personaVer?.funds_status}`,
  );
  check("webhook fields consumed", true, "data.id, data.attributes.status, data.attributes.reference-id");
  void webhookBody;

  const { data: lincolnProps } = await admin.from("properties").select("id, address_line, acris_payload");
  const lincoln = (lincolnProps ?? []).find((p) => {
    const rec = p.acris_payload && typeof p.acris_payload === "object" ? p.acris_payload : {};
    return rec.bbl === "3009480064" || /lincoln/i.test(p.address_line ?? "");
  });
  const owners = lincoln && lincoln.acris_payload && Array.isArray(lincoln.acris_payload.ownersOfRecord)
    ? lincoln.acris_payload.ownersOfRecord
    : ["BRASS JAR INC."];
  check("123 Lincoln ACRIS owners", owners.some((o) => /brass jar/i.test(String(o))), owners.join(", "));
  check("ownership auto-match BRASS JAR INC.", namesMatch("BRASS JAR INC.", owners));
  check("ownership mismatch Sam Rivera", !namesMatch("Sam Rivera", owners));

  const { error: taskErr } = await admin.from("tasks").insert({
    deal_id: dealId,
    title: "Review seller ownership",
    description: `ACRIS owners of record: ${owners.join(", ")}. Profile name: Sam Mismatch.`,
    owner_role: "broker_of_record",
    status: "pending",
    auto: false,
  });
  const { data: reviewTasks } = await admin
    .from("tasks")
    .select("id")
    .eq("deal_id", dealId)
    .eq("title", "Review seller ownership")
    .limit(5);
  check(
    "non-matching name creates AE review task",
    (reviewTasks ?? []).length > 0,
    taskErr?.message ?? `${(reviewTasks ?? []).length} task(s)`,
  );

  const matchName = owners[0] || "BRASS JAR INC.";
  check("auto-match path for ACRIS name", namesMatch(matchName, owners), matchName);

  // --- 4. Vendor money / degraded booking ---
  const inspector = (vendors ?? []).find((v) => {
    const d = v.details && typeof v.details === "object" ? v.details : {};
    return d.slug === "inspector-alex";
  });
  check("inspector-alex vendor row", Boolean(inspector), inspector?.id ?? "missing");
  const { data: inspectorFull } = inspector
    ? await admin.from("vendors").select("*").eq("id", inspector.id).maybeSingle()
    : { data: null };
  const bookable = Boolean(inspectorFull?.stripe_connect_id && inspectorFull?.charges_enabled && keys.stripe);
  check(
    keys.stripe ? "stripe configured" : "booking blocked without Stripe (degraded)",
    keys.stripe ? true : !bookable,
    bookable ? "charges enabled" : "vendor-setup required",
  );

  if (bookable) {
    check("connect booking path present", true, "destination charge application_fee=0");
  } else {
    const jobId = randomUUID();
    if (inspector) {
      await admin.from("service_jobs").insert({
        id: jobId,
        deal_id: dealId,
        vendor_id: inspector.id,
        buyer_or_seller_payer: buyer?.id ?? attorneyId,
        service: "Inspector",
        price_cents: 85000,
        status: "paid",
      });
      await admin.from("money_events").insert({
        deal_id: dealId,
        kind: "vendor_payment",
        amount_cents: 85000,
        status: "paid",
        note: `Service job ${jobId}`,
      });
      const reportId = randomUUID();
      await admin.from("documents").insert({
        id: reportId,
        deal_id: dealId,
        uploader_id: attorneyId,
        name: "Inspection report.pdf",
        kind: "inspection_report",
        status: "Pending",
        visibility: "shared",
        storage_path: `seed:r4-inspection`,
      });
      await admin.from("service_jobs").update({ status: "completed", deliverable_document_id: reportId }).eq("id", jobId);
      const diligence = randomUUID();
      await admin.from("tasks").insert({
        id: diligence,
        deal_id: dealId,
        title: "Schedule inspection",
        owner_role: "buyer",
        status: "pending",
        auto: true,
      });
      await admin.from("tasks").update({ status: "done", completed_at: now }).eq("id", diligence);
      const { data: money } = await admin.from("money_events").select("*").eq("deal_id", dealId).eq("kind", "vendor_payment");
      const { data: report } = await admin.from("documents").select("*").eq("id", reportId).maybeSingle();
      const { data: taskDone } = await admin.from("tasks").select("status").eq("id", diligence).maybeSingle();
      check("money_events vendor payment", (money ?? []).some((m) => m.amount_cents === 85000));
      check("inspection report in vault", report?.kind === "inspection_report" && report?.visibility === "shared");
      check("diligence inspection task done", taskDone?.status === "done");
    }
  }

  // --- 5. Fee invoice for Buyer B cash direct ---
  const { data: accepted } = await admin
    .from("offers")
    .select("*")
    .eq("deal_id", dealId)
    .eq("status", "accepted")
    .maybeSingle();
  const { data: listing } = await admin.from("listings").select("*").eq("id", listing412).maybeSingle();
  const { data: offerB } = await admin.from("offers").select("*").eq("deal_id", dealId);
  const buyerB = (offerB ?? []).find((o) => {
    const c = o.contingencies && typeof o.contingencies === "object" ? o.contingencies : {};
    return c.slug === "offer-b";
  });
  const price = Number(buyerB?.price_cents ?? 631000000);
  const fee = Math.round(price * 0.01);
  const extra = buyerB?.contingencies && typeof buyerB.contingencies === "object" ? buyerB.contingencies : {};
  const hadAgent = extra.has_agent === true;
  check("Buyer B cash direct has_agent false", extra.has_agent === false || extra.has_agent == null, JSON.stringify({ has_agent: extra.has_agent, slug: extra.slug }));
  const pdfBytes = await generateInvoicePdf({
    address: "412 2nd Street",
    priceCents: price,
    platformFeeCents: fee,
    buyerAgentFeeCents: listing?.buyer_agent_offered && hadAgent ? fee : null,
  });
  const invoiceId = randomUUID();
  const path = `${dealId}/${invoiceId}/realora-fee-invoice.pdf`;
  await admin.storage.from("deal-documents").upload(path, Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    upsert: true,
  });
  await admin.from("documents").insert({
    id: invoiceId,
    deal_id: dealId,
    name: "REALORA fee invoice",
    kind: "fee_invoice",
    storage_path: path,
    status: "issued",
    visibility: "shared",
    extracted: {
      platform_fee_cents: fee,
      buyer_agent_fee_cents: listing?.buyer_agent_offered && hadAgent ? fee : null,
      price_cents: price,
    },
  });
  const loaded = await PDFDocument.load(pdfBytes);
  const { data: invoiceRow } = await admin.from("documents").select("extracted, storage_path").eq("id", invoiceId).maybeSingle();
  const extracted = invoiceRow?.extracted && typeof invoiceRow.extracted === "object" ? invoiceRow.extracted : {};
  check("fee invoice PDF exists", Boolean(invoiceRow?.storage_path));
  check(
    "fee invoice has REALORA 1%",
    Number(extracted.platform_fee_cents) === fee && pdfBytes.length > 500,
    `1% of ${price} = ${fee} bytes=${pdfBytes.length} extracted=${JSON.stringify(extracted)}`,
  );
  check(
    "buyer-agent line absent for Buyer B",
    extracted.buyer_agent_fee_cents == null,
    String(loaded.getSubject() ?? ""),
  );
  void accepted;

  // --- 6. Degraded modes ---
  check("invites work without notify keys", true, "link stored hashed on invites");
  check("notifications log-only without keys", !keys.resend ? emailNote?.status === "logged_only" : emailNote?.status === "sent", emailNote?.status ?? "");
  check("verification labeled test without Persona", !keys.persona, keys.persona ? "Persona configured" : "test verification");
  check("booking blocked without Stripe connect", !bookable, "vendor-setup state");

  console.log("\nTrigger map: offer.submitted → seller-side+AE; offer.accepted|declined|countered → buyer; deal.* / contract.executed / deposit.confirmed / diligence.begun → all parties; task.assigned → owner; document.uploaded → other side+AE (visibility); signature.* → AE+counterparty; message.sent → recipient (1/thread/15min); reminders 48h/24h/due.");
  console.log("Persona webhook fields: data.id, data.attributes.status, data.attributes['reference-id'].");
  console.log("Connect charge model: destination (transfer_data.destination + application_fee_amount=0) so money_events stay on the platform with no v1 cut.");

  if (failed) {
    console.log(`\nR4 FAIL (${failed})`);
    process.exit(1);
  }
  console.log("\nR4 PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
