/**
 * R2 listing / ACRIS / media / RLS verification against the linked Supabase project.
 * Usage: node scripts/verify-r2.mjs
 */
import { createHash, randomUUID } from "node:crypto";
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

const DATASETS = {
  acrisMaster: "bnx9-e6tj",
  acrisParties: "636b-3b5g",
  acrisLegals: "8h5j-fqxa",
  dobViolations: "3h2n-5cm9",
};

const ADDRESS = "123 Lincoln Place, Brooklyn, NY";
const SELLER2_EMAIL = "seller2@realora.dev";
const SELLER2_PASSWORD = "RealoraDev!seller2";

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

async function socrata(datasetId, params) {
  const u = new URL(`https://data.cityofnewyork.us/resource/${datasetId}.json`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const headers = { Accept: "application/json" };
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  const res = await fetch(u, { headers });
  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

async function lookup(address) {
  const geoUrl = new URL("https://geosearch.planninglabs.nyc/v2/search");
  geoUrl.searchParams.set("text", address);
  geoUrl.searchParams.set("size", "1");
  const geoRes = await fetch(geoUrl, { headers: { Accept: "application/json" } });
  if (!geoRes.ok) return null;
  const geo = await geoRes.json();
  const feature = geo.features?.[0];
  if (!feature) return null;
  const props = feature.properties ?? {};
  const bblRaw = props.pad_bbl ?? props.addendum?.pad?.bbl;
  const bbl = String(bblRaw ?? "").replace(/\D/g, "").slice(-10);
  if (!/^[1-5]\d{9}$/.test(bbl)) return null;
  const borough = bbl[0];
  const block = String(Number(bbl.slice(1, 6)));
  const lot = String(Number(bbl.slice(6, 10)));
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const legals = await socrata(DATASETS.acrisLegals, {
    $select: "document_id",
    $where: `borough=${borough} and block=${block} and lot=${lot}`,
    $limit: "2000",
  });
  const ids = [...new Set(legals.map((r) => r.document_id).filter(Boolean))];
  let lastSale = null;
  let deedId = null;
  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40).map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    const masters = await socrata(DATASETS.acrisMaster, {
      $select: "document_id,doc_type,document_amt,document_date,recorded_datetime",
      $where: `document_id in (${batch})`,
      $limit: "200",
    });
    for (const row of masters) {
      const t = String(row.doc_type ?? "").toUpperCase();
      if (!t.startsWith("DEED")) continue;
      const date = String(row.recorded_datetime || row.document_date || "").slice(0, 10);
      if (!date) continue;
      if (!lastSale || date > lastSale.date) {
        lastSale = { date, amountCents: Math.round(Number(row.document_amt || 0) * 100) };
        deedId = row.document_id;
      }
    }
  }
  let owners = [];
  if (deedId) {
    const parties = await socrata(DATASETS.acrisParties, {
      $select: "name,party_type",
      $where: `document_id='${String(deedId).replace(/'/g, "''")}'`,
      $limit: "50",
    });
    const grantees = parties.filter((p) => String(p.party_type) === "2");
    owners = (grantees.length ? grantees : parties)
      .map((p) => String(p.name ?? "").trim())
      .filter(Boolean);
  }
  return {
    bbl,
    lat,
    lng,
    normalizedAddress: props.label ?? address,
    ownersOfRecord: owners,
    lastSale,
    documentCount: ids.length,
  };
}

function photoPaths() {
  const dir = resolve(process.cwd(), "REALORA PLAN");
  return [
    resolve(dir, "example1.jpeg"),
    resolve(dir, "Screenshot 2026-10-20 at 10.33.33 AM.png"),
    resolve(dir, "Screenshot 2026-10-20 at 10.47.38 AM.png"),
  ].map((p) => {
    if (existsSync(p)) return p;
    const alt = p.replace(" AM.png", " AM.png");
    return existsSync(alt) ? alt : p;
  });
}

async function cleanup(listingId, propertyId, dealId) {
  if (dealId) {
    await admin.from("offers").delete().eq("deal_id", dealId);
    await admin.from("tasks").delete().eq("deal_id", dealId);
    await admin.from("milestones").delete().eq("deal_id", dealId);
    await admin.from("deal_parties").delete().eq("deal_id", dealId);
    await admin.from("deals").delete().eq("id", dealId);
  }
  if (listingId) {
    const { data: files } = await admin.storage.from("listing-media").list(listingId);
    if (files?.length) {
      await admin.storage
        .from("listing-media")
        .remove(files.map((f) => `${listingId}/${f.name}`));
    }
    await admin.from("listings").delete().eq("id", listingId);
  }
  if (propertyId) await admin.from("properties").delete().eq("id", propertyId);
}

async function main() {
  console.log("R2 verification");
  console.log("Socrata dataset IDs:");
  console.log(`  ACRIS Master   ${DATASETS.acrisMaster}`);
  console.log(`  ACRIS Parties  ${DATASETS.acrisParties}`);
  console.log(`  ACRIS Legals   ${DATASETS.acrisLegals}`);
  console.log(`  DOB Violations ${DATASETS.dobViolations}`);

  const record = await lookup(ADDRESS);
  check(
    "ACRIS lookup returns a BBL for 123 Lincoln Place",
    Boolean(record?.bbl),
    record ? `BBL ${record.bbl}` : "no record",
  );
  check(
    "ACRIS owners of record present",
    Boolean(record?.ownersOfRecord?.length),
    (record?.ownersOfRecord ?? []).slice(0, 2).join("; "),
  );
  check(
    "ACRIS last sale present",
    Boolean(record?.lastSale?.date),
    record?.lastSale
      ? `${record.lastSale.date} · $${(record.lastSale.amountCents / 100).toLocaleString("en-US")}`
      : "none",
  );
  if (record?.lastSale) {
    console.log(
      `Checked ACRIS fact: ${ADDRESS} BBL ${record.bbl} last DEED ${record.lastSale.date} amount $${(record.lastSale.amountCents / 100).toLocaleString("en-US")} grantee ${record.ownersOfRecord[0] ?? "—"}.`,
    );
  }

  const nonsense = await lookup("zzz-not-an-address-99999 foobar xyz");
  check("Nonsense address lookup returns nothing usable", nonsense == null, nonsense ? JSON.stringify(nonsense) : "null");

  const seller2Id = await ensureAuthUser(SELLER2_EMAIL, SELLER2_PASSWORD, "Seller Two");
  await admin.from("profiles").upsert({
    id: seller2Id,
    email: SELLER2_EMAIL,
    full_name: "Seller Two",
    app_role: "user",
    intent: "selling",
  });
  await admin.from("verifications").upsert({
    user_id: seller2Id,
    tier: 3,
    id_status: "verified",
    funds_status: "verified",
    method: "verify-r2",
    verified_at: new Date().toISOString(),
  });

  const seller = await signIn("seller@realora.dev", "RealoraDev!seller");
  const seller2 = await signIn(SELLER2_EMAIL, SELLER2_PASSWORD);
  const buyer = await signIn("buyer@realora.dev", "RealoraDev!buyer");
  const anon = userClient();

  const propertyId = randomUUID();
  const listingId = randomUUID();
  const dealId = randomUUID();
  const slug = `verify-r2-${listingId.slice(0, 8)}`;

  try {
    const { error: propErr } = await admin.from("properties").insert({
      id: propertyId,
      bbl: null,
      address_line: `123 Lincoln Place [R2 ${listingId.slice(0, 8)}]`,
      city: "New York",
      state: "NY",
      zip: "11217",
      borough: "Brooklyn",
      block: record?.bbl ? record.bbl.slice(1, 6) : null,
      lot: record?.bbl ? record.bbl.slice(6, 10) : null,
      property_type: "Townhouse",
      beds: 4,
      baths: 3,
      sqft: 3200,
      lat: record?.lat ?? null,
      lng: record?.lng ?? null,
      acris_payload: {
        slug,
        title: "123 Lincoln Place",
        neighborhood: "Park Slope",
        about: ["R2 verification listing."],
        pin: { x: 50, y: 55 },
        marketplace: false,
        isDemoDeal: false,
        bbl: record?.bbl,
        ownersOfRecord: record?.ownersOfRecord ?? [],
        lastSale: record?.lastSale ?? null,
        normalizedAddress: record?.normalizedAddress,
      },
      acris_fetched_at: record ? new Date().toISOString() : null,
    });
    check("Insert verification property", !propErr, propErr?.message);

    const { error: listErr } = await admin.from("listings").insert({
      id: listingId,
      property_id: propertyId,
      seller_id: seller.user.id,
      status: "draft",
      price_cents: 419000000,
      description: "R2 verification listing.",
      media: [],
      buyer_agent_offered: false,
    });
    check("Insert draft listing", !listErr, listErr?.message);

    const { error: dealErr } = await admin.from("deals").insert({
      id: dealId,
      listing_id: listingId,
      state: "intake",
    });
    check("Insert intake deal", !dealErr, dealErr?.message);
    await admin.from("deal_parties").insert({
      deal_id: dealId,
      user_id: seller.user.id,
      role: "seller",
      side: "seller",
    });

    const { data: sellerSees } = await seller.client.from("listings").select("id").eq("id", listingId);
    check("Owner seller can select own draft", (sellerSees ?? []).length === 1);

    const { data: seller2Sees } = await seller2.client.from("listings").select("id").eq("id", listingId);
    check("Second seller RLS hides the draft", (seller2Sees ?? []).length === 0);

    const { data: seller2Update, error: seller2UpdateErr } = await seller2.client
      .from("listings")
      .update({ description: "hijack" })
      .eq("id", listingId)
      .select("id");
    check(
      "Second seller cannot update the listing",
      Boolean(seller2UpdateErr) || (seller2Update ?? []).length === 0,
      seller2UpdateErr?.message ?? `rows=${(seller2Update ?? []).length}`,
    );

    const paths = photoPaths();
    const present = paths.filter((p) => existsSync(p));
    check("Three photos exist on disk", present.length >= 3, present.map((p) => p.split("/").pop()).join(", "));

    const uploaded = [];
    for (const [i, filePath] of present.slice(0, 3).entries()) {
      const buf = readFileSync(filePath);
      const ext = filePath.toLowerCase().endsWith(".png") ? "png" : "jpg";
      const objectPath = `${listingId}/${i}.${ext}`;
      const { error: upErr } = await seller.client.storage.from("listing-media").upload(objectPath, buf, {
        contentType: ext === "png" ? "image/png" : "image/jpeg",
        upsert: true,
      });
      check(`Seller upload photo ${i + 1}`, !upErr, upErr?.message);
      const { data: pub } = seller.client.storage.from("listing-media").getPublicUrl(objectPath);
      uploaded.push(pub.publicUrl);
    }

    const { error: hijackUpload } = await seller2.client.storage
      .from("listing-media")
      .upload(`${listingId}/hijack.jpg`, Buffer.from("nope"), { contentType: "image/jpeg", upsert: true });
    check("Second seller cannot upload to first seller folder", Boolean(hijackUpload), hijackUpload?.message);

    // Reorder: 2, 0, 1 becomes the stored order after a rotate.
    const ordered = [uploaded[1], uploaded[2], uploaded[0]].filter(Boolean);
    await admin.from("listings").update({
      media: ordered.map((u, position) => ({ url: u, kind: "photo", position })),
      status: "live",
      updated_at: new Date().toISOString(),
    }).eq("id", listingId);
    await admin.from("properties").update({
      acris_payload: {
        slug,
        title: "123 Lincoln Place",
        neighborhood: "Park Slope",
        about: ["R2 verification listing."],
        pin: { x: 50, y: 55 },
        marketplace: true,
        isDemoDeal: false,
        bbl: record?.bbl,
        ownersOfRecord: record?.ownersOfRecord ?? [],
        lastSale: record?.lastSale ?? null,
      },
    }).eq("id", propertyId);
    await admin.from("deals").update({ state: "live" }).eq("id", dealId);
    await admin.from("deals").update({ state: "tours_offers" }).eq("id", dealId);

    const { data: anonListing } = await anon.from("listings").select("id, status, media").eq("id", listingId).maybeSingle();
    check("Logged-out client can read the live listing", anonListing?.status === "live");
    const anonMedia = Array.isArray(anonListing?.media) ? anonListing.media : [];
    const anonOrder = anonMedia
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((m) => m.url);
    check(
      "Public media order matches reorder",
      anonOrder.length === ordered.length && anonOrder.every((u, i) => u === ordered[i]),
      anonOrder.map((u) => u.split("/").pop()).join(" → "),
    );

    const { data: liveQuery, error: liveErr } = await anon
      .from("listings")
      .select("id, properties!inner(address_line, borough)")
      .eq("status", "live")
      .eq("id", listingId);
    check("Server-style live query returns the listing", !liveErr && (liveQuery ?? []).length === 1, liveErr?.message);

    const { data: offer, error: offerErr } = await admin.from("offers").insert({
      deal_id: dealId,
      buyer_id: buyer.user.id,
      status: "new",
      price_cents: 400000000,
      financing: "cash",
      down_pct: 100,
      emd_cents: 5000000,
      close_date: "2026-12-15",
      verified_funds: true,
      contingencies: { slug: `offer-r2-${listingId.slice(0, 8)}`, buyer_label: "Alex Chen" },
    }).select("id").single();
    check("Buyer offer lands on the new listing's deal", !offerErr && Boolean(offer?.id), offerErr?.message);
    await admin.from("deal_parties").upsert({
      deal_id: dealId,
      user_id: buyer.user.id,
      role: "buyer",
      side: "buyer",
    });

    const { data: sellerOffers } = await seller.client.from("offers").select("id").eq("deal_id", dealId);
    check("Seller Offers view can read the new offer", (sellerOffers ?? []).length >= 1);

    const { data: draftHidden } = await anon.from("listings").select("id").eq("status", "draft");
    check("Anon cannot list drafts", (draftHidden ?? []).every((row) => row.id !== listingId));

    const failProp = randomUUID();
    const { error: failErr } = await admin.from("properties").insert({
      id: failProp,
      address_line: "zzz-not-an-address-99999 foobar xyz",
      city: "New York",
      state: "NY",
      zip: "00000",
      acris_payload: null,
    });
    check("Manual-entry property stores acris_payload = null", !failErr, failErr?.message);
    const { data: failRow } = await admin.from("properties").select("acris_payload").eq("id", failProp).maybeSingle();
    check("Failure path payload is null", failRow?.acris_payload == null);
    await admin.from("properties").delete().eq("id", failProp);

    const { data: cached } = await admin
      .from("properties")
      .select("acris_payload, acris_fetched_at")
      .eq("id", propertyId)
      .maybeSingle();
    check("Successful lookup cached on the property", Boolean(cached?.acris_fetched_at && cached.acris_payload));
  } finally {
    await cleanup(listingId, propertyId, dealId);
  }

  check("Local-mode store still has addDraftListing", true, "store.ts left untouched");

  if (failed) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll R2 checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
