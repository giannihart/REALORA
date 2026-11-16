/**
 * Idempotent project seed. Usage:
 *   SEED_PASSWORD_SELLER=… SEED_PASSWORD_BUYER=… SEED_PASSWORD_BROKER=… npm run seed
 *   … npm run seed:reset   (wipe public rows, then re-insert)
 *
 * Passwords for the three sign-in accounts are required via env — never committed.
 * Competing offer buyers exist as profiles only (unguessable passwords, never printed).
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_LISTING_ID,
  documents,
  listings,
  messages,
  offers,
  threads,
  tours,
  vendors as seedVendors,
} from "../src/data/seed";
import { dollarsToCents, acrisFromListing, mediaFromListing, financingToDb } from "../src/lib/data/map";
import { deriveVerificationTier } from "../src/lib/offers";
import type { Database } from "../src/lib/database.types";
import type { Json } from "../src/lib/database.types";
import type { FinancingType } from "../src/lib/types";

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
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient<Database>(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function stableUuid(key: string): string {
  const h = createHash("sha256").update(`realora:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function requireSignInPassword(envKey: string, email: string): string {
  const value = process.env[envKey]?.trim();
  if (!value || value.length < 12) {
    console.error(`Set ${envKey} to a strong password (≥12 chars) for ${email}.`);
    process.exit(1);
  }
  return value;
}

/** Opaque password for profile-only users — never logged. */
function opaquePassword(): string {
  return `x!${randomBytes(24).toString("base64url")}`;
}

const SIGN_IN = [
  {
    email: "seller@realora.dev",
    name: "Sam Rivera",
    role: "user" as const,
    intent: "selling" as const,
    password: requireSignInPassword("SEED_PASSWORD_SELLER", "seller@realora.dev"),
  },
  {
    email: "buyer@realora.dev",
    name: "Alex Chen",
    role: "user" as const,
    intent: "buying" as const,
    password: requireSignInPassword("SEED_PASSWORD_BUYER", "buyer@realora.dev"),
  },
  {
    email: "broker@realora.dev",
    name: "Jordan Hale",
    role: "broker" as const,
    intent: "both" as const,
    password: requireSignInPassword("SEED_PASSWORD_BROKER", "broker@realora.dev"),
  },
] as const;

/** Competing offer parties + secondary listing owner — no published credentials. */
const PROFILE_ONLY = [
  { email: "offera@realora.dev", name: "Morgan Ellis", role: "user" as const, intent: "buying" as const },
  { email: "offerc@realora.dev", name: "Casey Nguyen", role: "user" as const, intent: "buying" as const },
  {
    email: "listing-owner-ppw@realora.dev",
    name: "Taylor Brooks",
    role: "user" as const,
    intent: "selling" as const,
  },
] as const;

async function ensureUser(email: string, name: string, password: string): Promise<string> {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (!error && created.user) return created.user.id;

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list.users.find((u) => u.email === email);
  if (!existing) {
    throw new Error(`Could not create or find ${email}: ${error?.message}`);
  }
  await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  return existing.id;
}

async function retireOtherAuthUsers(keepEmails: Set<string>) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of list.users) {
    const email = (user.email ?? "").toLowerCase();
    if (!email || keepEmails.has(email)) continue;
    // Rotate credentials on leftover rehearsal accounts so they cannot sign in.
    await admin.auth.admin.updateUserById(user.id, {
      password: opaquePassword(),
      email_confirm: true,
    });
  }
}

async function resetPublicRows() {
  const tables = [
    "notifications",
    "service_jobs",
    "invites",
    "events",
    "money_events",
    "messages",
    "documents",
    "milestones",
    "tasks",
    "offers",
    "deal_parties",
    "deals",
    "saved_homes",
    "listings",
    "properties",
  ] as const;
  await admin.from("events").delete().gt("id", 0);
  await admin.from("deal_parties").delete().neq("role", "vendor");
  await admin.from("deal_parties").delete().eq("role", "vendor");
  for (const table of tables.filter((t) => t !== "events" && t !== "deal_parties")) {
    await admin.from(table).delete().gte("created_at", "1970-01-01");
  }
}

async function syncOfferVerification(
  buyerUserId: string,
  financing: FinancingType,
  verifiedFunds: boolean,
  explicit: Parameters<typeof deriveVerificationTier>[2],
) {
  const { data: rows } = await admin.from("offers").select("*").eq("buyer_id", buyerUserId);
  for (const row of rows ?? []) {
    const fin = financingFromRow(row.financing) ?? financing;
    const extra =
      row.contingencies && typeof row.contingencies === "object" && !Array.isArray(row.contingencies)
        ? { ...(row.contingencies as Record<string, unknown>) }
        : {};
    const tier = deriveVerificationTier(fin, verifiedFunds, explicit);
    extra.verification_tier = tier;
    await admin
      .from("offers")
      .update({
        verified_funds: verifiedFunds,
        contingencies: extra as Json,
      })
      .eq("id", row.id);
  }
}

function financingFromRow(value: string | null): FinancingType | null {
  if (!value) return null;
  const map: Record<string, FinancingType> = {
    cash: "Cash",
    conventional: "Conventional",
    // Legacy seed values — fold into Conventional (FinancingType no longer has FHA/VA).
    fha: "Conventional",
    va: "Conventional",
    jumbo: "Jumbo",
  };
  return map[value] ?? null;
}

async function main() {
  const reset = process.argv.includes("--reset");
  const ids: Record<string, string> = {};

  for (const u of SIGN_IN) {
    ids[u.email] = await ensureUser(u.email, u.name, u.password);
  }
  for (const u of PROFILE_ONLY) {
    ids[u.email] = await ensureUser(u.email, u.name, opaquePassword());
  }

  const keep = new Set<string>([
    ...SIGN_IN.map((u) => u.email),
    ...PROFILE_ONLY.map((u) => u.email),
  ]);
  await retireOtherAuthUsers(keep);

  if (reset) {
    console.log("Wiping public rows…");
    await resetPublicRows();
  }

  for (const u of SIGN_IN) {
    await admin.from("profiles").upsert({
      id: ids[u.email],
      email: u.email,
      full_name: u.name,
      app_role: u.role,
      intent: u.intent,
    });
  }
  for (const u of PROFILE_ONLY) {
    await admin.from("profiles").upsert({
      id: ids[u.email],
      email: u.email,
      full_name: u.name,
      app_role: u.role,
      intent: u.intent,
    });
  }

  const sellerId = ids["seller@realora.dev"];
  const buyerId = ids["buyer@realora.dev"];
  const brokerId = ids["broker@realora.dev"];
  const buyerA = ids["offera@realora.dev"];
  const buyerC = ids["offerc@realora.dev"];
  const ppwSellerId = ids["listing-owner-ppw@realora.dev"];

  // Seller: verified ownership. Buyer: ID verified; funds confirmed via AE record below.
  await admin.from("verifications").upsert({
    user_id: sellerId,
    tier: 3,
    id_status: "verified",
    funds_status: "verified",
    method: "ae_confirmed",
    verified_at: "2026-09-08T12:00:00Z",
  });
  await admin.from("verifications").upsert({
    user_id: buyerId,
    tier: 2,
    id_status: "verified",
    funds_status: "pending",
    method: "id_verified",
    verified_at: "2026-09-08T12:00:00Z",
  });
  await admin.from("verifications").upsert({
    user_id: brokerId,
    tier: 3,
    id_status: "verified",
    funds_status: "verified",
    method: "ae_confirmed",
    verified_at: "2026-09-01T12:00:00Z",
  });
  await admin.from("verifications").upsert({
    user_id: buyerA,
    tier: 2,
    id_status: "verified",
    funds_status: "pending",
    method: "id_verified",
    verified_at: "2026-09-10T12:00:00Z",
  });
  await admin.from("verifications").upsert({
    user_id: buyerC,
    tier: 1,
    id_status: "pending",
    funds_status: "pending",
    method: null,
    verified_at: null,
  });
  await admin.from("verifications").upsert({
    user_id: ppwSellerId,
    tier: 3,
    id_status: "verified",
    funds_status: "verified",
    method: "ae_confirmed",
    verified_at: "2026-09-05T12:00:00Z",
  });

  const scenarioListingIds = new Set([DEMO_LISTING_ID, "88-prospect-park-west"]);
  const marketplaceLive = listings.filter(
    (l) => l.marketplace && l.status === "live" && !scenarioListingIds.has(l.id),
  );
  const marketplaceSold = listings.filter(
    (l) => l.marketplace && l.status === "closed" && !scenarioListingIds.has(l.id),
  );
  // Scenario homes plus a browseable live + sold catalog for /buy UI.
  const toSeed = [
    ...listings.filter((l) => scenarioListingIds.has(l.id)),
    ...marketplaceLive,
    ...marketplaceSold,
  ];

  for (const listing of toSeed) {
    const propertyId = stableUuid(`property:${listing.id}`);
    const listingId = stableUuid(`listing:${listing.id}`);
    const ownerId =
      listing.id === DEMO_LISTING_ID
        ? sellerId
        : listing.id === "88-prospect-park-west"
          ? ppwSellerId
          : ppwSellerId;
    const payload = acrisFromListing(listing);
    if (listing.id === DEMO_LISTING_ID) {
      (payload as Record<string, unknown>).tours = tours;
    }
    await admin.from("properties").upsert({
      id: propertyId,
      address_line: listing.address,
      city: listing.city,
      state: listing.state,
      zip: listing.zip,
      borough: listing.borough,
      property_type: listing.type,
      beds: listing.beds,
      baths: listing.baths,
      sqft: listing.sqft,
      year_built: listing.yearBuilt,
      lat: listing.lat ?? null,
      lng: listing.lng ?? null,
      acris_payload: payload,
    });
    await admin.from("listings").upsert({
      id: listingId,
      property_id: propertyId,
      seller_id: ownerId,
      status:
        listing.status === "in_contract"
          ? "under_contract"
          : listing.status === "closed"
            ? "closed"
            : listing.status === "draft"
              ? "draft"
              : "live",
      price_cents: dollarsToCents(listing.price),
      description: listing.about.join("\n\n"),
      media: mediaFromListing(listing),
      buyer_agent_offered: listing.offerBuyerAgentPercent === 1,
    });
  }

  const demoListingId = stableUuid(`listing:${DEMO_LISTING_ID}`);
  const dealId = stableUuid("deal:412");

  await admin.from("deals").upsert({
    id: dealId,
    listing_id: demoListingId,
    state: "tours_offers",
  });

  const parties: Database["public"]["Tables"]["deal_parties"]["Insert"][] = [
    { deal_id: dealId, user_id: sellerId, role: "seller", side: "seller" },
    { deal_id: dealId, user_id: sellerId, role: "agent_seller", side: "seller" },
    { deal_id: dealId, user_id: buyerId, role: "buyer", side: "buyer" },
    { deal_id: dealId, user_id: brokerId, role: "broker_of_record", side: "seller" },
  ];
  for (const p of parties) {
    await admin.from("deal_parties").upsert(p);
  }

  const offerBuyers: Record<string, string> = {
    "offer-a": buyerA,
    "offer-b": buyerId,
    "offer-c": buyerC,
  };

  const offerIndex = { "offer-a": 0, "offer-b": 1, "offer-c": 2 } as const;
  for (const offer of offers) {
    const verifiedFunds = false; // earned only via AE sync below
    const expires = new Date();
    expires.setHours(23, 59, 59, 0);
    expires.setDate(expires.getDate() + 2 + (offerIndex[offer.id as keyof typeof offerIndex] ?? 0));
    await admin.from("offers").upsert({
      id: stableUuid(`offer:${offer.id}`),
      deal_id: dealId,
      buyer_id: offerBuyers[offer.id],
      status: "new",
      price_cents: dollarsToCents(offer.price),
      financing: financingToDb(offer.financing),
      down_pct: offer.downPercent,
      emd_cents: dollarsToCents(offer.emd),
      close_date: offer.closeDate,
      expires_at: expires.toISOString(),
      verified_funds: verifiedFunds,
      certainty_label: offer.certaintyLabel,
      ai_note: offer.note,
      contingencies: {
        slug: offer.id,
        buyer_label: offer.buyerLabel,
        inspection: offer.inspectionContingency,
        financing: offer.financingContingency,
        concessions: offer.concessions,
        score: offer.score,
        has_agent: offer.agentAttached,
        verification_tier: "self_reported",
      } satisfies Json,
    });
  }

  // Buyer A — pre-approved docs verified (AE-equivalent record on the offer).
  await syncOfferVerification(buyerA, "Conventional", true, "preapproved_docs_verified");
  // Buyer B — cash funds via the same bridge confirmFunds uses (verification row + offer sync).
  await admin.from("verifications").upsert({
    user_id: buyerId,
    tier: 2,
    id_status: "verified",
    funds_status: "verified",
    method: "ae_confirmed",
    verified_at: "2026-10-09T16:00:00Z",
  });
  await syncOfferVerification(buyerId, "Cash", true, null);
  // Buyer C stays self-reported.
  await syncOfferVerification(buyerC, "Jumbo", false, "self_reported");

  const buyerMiles = [
    { key: "b1", label: "Buyer onboarding", position: 1, status: "complete" as const, completed_at: "2026-09-08T12:00:00Z", target_date: null as string | null },
    { key: "b2", label: "Offer submitted", position: 2, status: "complete" as const, completed_at: "2026-10-09T12:00:00Z", target_date: null },
    { key: "b3", label: "Offer accepted", position: 3, status: "upcoming" as const, completed_at: null, target_date: "2026-10-12" },
    { key: "b4", label: "Earnest money deposit", position: 4, status: "upcoming" as const, completed_at: null, target_date: "2026-10-14" },
    { key: "b5", label: "Inspection and due diligence", position: 5, status: "upcoming" as const, completed_at: null, target_date: "2026-10-24" },
    { key: "b6", label: "Mortgage underwriting and appraisal", position: 6, status: "upcoming" as const, completed_at: null, target_date: "2026-10-31" },
    { key: "b7", label: "Title & closing prep", position: 7, status: "upcoming" as const, completed_at: null, target_date: "2026-11-06" },
    { key: "b8", label: "Clear to close", position: 8, status: "upcoming" as const, completed_at: null, target_date: "2026-11-12" },
    { key: "b9", label: "Closing day", position: 9, status: "upcoming" as const, completed_at: null, target_date: "2026-11-08" },
    { key: "b10", label: "Deed recorded & keys", position: 10, status: "upcoming" as const, completed_at: null, target_date: "2026-11-10" },
  ];
  const sellerMiles = [
    { key: "s1", label: "Listing prep", position: 1, status: "complete" as const, completed_at: "2026-09-12T12:00:00Z", target_date: null as string | null },
    { key: "s2", label: "Live", position: 2, status: "complete" as const, completed_at: "2026-09-18T12:00:00Z", target_date: null },
    { key: "s3", label: "Tours", position: 3, status: "upcoming" as const, completed_at: null, target_date: "2026-10-16" },
    { key: "s4", label: "Offers", position: 4, status: "upcoming" as const, completed_at: null, target_date: "2026-10-23" },
    { key: "s5", label: "Accepted", position: 5, status: "upcoming" as const, completed_at: null, target_date: "2026-10-12" },
    { key: "s6", label: "Contract", position: 6, status: "upcoming" as const, completed_at: null, target_date: "2026-10-14" },
    { key: "s7", label: "Diligence", position: 7, status: "upcoming" as const, completed_at: null, target_date: "2026-10-27" },
    { key: "s8", label: "Clear to close", position: 8, status: "upcoming" as const, completed_at: null, target_date: "2026-11-06" },
    { key: "s9", label: "Closing", position: 9, status: "upcoming" as const, completed_at: null, target_date: "2026-11-08" },
    { key: "s10", label: "Closed", position: 10, status: "upcoming" as const, completed_at: null, target_date: "2026-11-10" },
  ];

  for (const m of buyerMiles) {
    await admin.from("milestones").upsert({
      id: stableUuid(`ms:${m.key}`),
      deal_id: dealId,
      key: m.key,
      label: m.label,
      audience: "buyer",
      position: m.position,
      status: m.status,
      completed_at: m.completed_at,
      target_date: m.target_date,
    });
  }
  for (const m of sellerMiles) {
    await admin.from("milestones").upsert({
      id: stableUuid(`ms:${m.key}`),
      deal_id: dealId,
      key: m.key,
      label: m.label,
      audience: "seller",
      position: m.position,
      status: m.status,
      completed_at: m.completed_at,
      target_date: m.target_date,
    });
  }

  const seedTasks = [
    {
      title: "Review three offers",
      description: "Rank by net proceeds and certainty.",
      owner_role: "seller",
      status: "in_progress" as const,
    },
    {
      title: "Share term sheet with seller",
      description: "Cash buyer terms are in Documents.",
      owner_role: "broker_of_record",
      status: "done" as const,
    },
  ];
  for (const t of seedTasks) {
    await admin.from("tasks").upsert({
      id: stableUuid(`task:${t.title}`),
      deal_id: dealId,
      title: t.title,
      description: t.description,
      owner_role: t.owner_role,
      status: t.status,
      auto: false,
      completed_at: t.status === "done" ? "2026-10-09T15:00:00Z" : null,
    });
  }

  for (const doc of documents) {
    await admin.from("documents").upsert({
      id: stableUuid(`doc:${doc.id}`),
      deal_id: dealId,
      uploader_id: doc.role === "seller" ? sellerId : buyerId,
      name: doc.name,
      kind: doc.group === "Closing" && /proof of funds/i.test(doc.name) ? "proof_of_funds" : doc.group,
      storage_path: `vault:${doc.id}`,
      status: doc.status,
      visibility: doc.role === "seller" ? "seller_side" : doc.role === "buyer" ? "buyer_side" : "shared",
      created_at: `${doc.date}T12:00:00Z`,
    });
  }

  const senderFor = (sender: string) => {
    if (sender.includes("Buyer") || sender === "You (Buyer)") return buyerId;
    if (sender.includes("Seller") || sender === "You (Seller)") return sellerId;
    if (sender.includes("Alex")) return buyerId;
    return brokerId;
  };

  for (const msg of messages) {
    await admin.from("messages").upsert({
      id: stableUuid(`msg:${msg.id}`),
      deal_id: dealId,
      thread_key: msg.threadId,
      sender_id: senderFor(msg.sender),
      body: msg.body,
      created_at: msg.at.replace(" ", "T") + ":00Z",
    });
  }

  for (const thread of threads) {
    const has = messages.some((m) => m.threadId === thread.id);
    if (has) continue;
    await admin.from("messages").upsert({
      id: stableUuid(`msg:thread-${thread.id}`),
      deal_id: dealId,
      thread_key: thread.id,
      sender_id: brokerId,
      body: thread.preview,
    });
  }

  for (const vendor of seedVendors) {
    await admin.from("vendors").upsert({
      id: stableUuid(`vendor:${vendor.id}`),
      business_name: vendor.name,
      services: [vendor.category],
      service_area: "NYC",
      active: true,
      details: {
        slug: vendor.id,
        category: vendor.category,
        price: vendor.price,
        rating: vendor.rating,
        reviews: vendor.reviews,
        blurb: vendor.blurb,
        tier: vendor.tier,
        recommended: Boolean(vendor.recommended),
      } satisfies Json,
    });
  }

  // Services: one chosen (requested), one scheduled (confirmed), one completed.
  const { data: vendorRows } = await admin.from("vendors").select("id, details");
  const bySlug = new Map<string, string>();
  for (const v of vendorRows ?? []) {
    const details =
      v.details && typeof v.details === "object" && !Array.isArray(v.details)
        ? (v.details as Record<string, unknown>)
        : {};
    if (typeof details.slug === "string") bySlug.set(details.slug, v.id);
  }
  const pickVendor = (...slugs: string[]) => {
    for (const slug of slugs) {
      const hit = bySlug.get(slug);
      if (hit) return hit;
    }
    const fuzzy = [...bySlug.entries()].find(([s]) =>
      slugs.some((want) => s.toLowerCase().includes(want.toLowerCase())),
    );
    return fuzzy?.[1] ?? [...bySlug.values()][0];
  };

  const inspectorVendor = pickVendor("inspector-alex");
  const photoVendor = pickVendor("photo-north");
  const cleanVendor = pickVendor("clean-aftercare");
  if (inspectorVendor) {
    await admin.from("service_jobs").upsert({
      id: stableUuid("job:inspector-chosen"),
      deal_id: dealId,
      vendor_id: inspectorVendor,
      service: "Inspector",
      price_cents: 85000,
      status: "requested",
      buyer_or_seller_payer: buyerId,
      scheduled_at: null,
    });
  }
  if (photoVendor) {
    await admin.from("service_jobs").upsert({
      id: stableUuid("job:photo-scheduled"),
      deal_id: dealId,
      vendor_id: photoVendor,
      service: "Photography",
      price_cents: 120000,
      status: "confirmed",
      buyer_or_seller_payer: sellerId,
      scheduled_at: "2026-10-20T15:00:00Z",
    });
  }
  if (cleanVendor) {
    await admin.from("service_jobs").upsert({
      id: stableUuid("job:clean-completed"),
      deal_id: dealId,
      vendor_id: cleanVendor,
      service: "Cleaning",
      price_cents: 45000,
      status: "completed",
      buyer_or_seller_payer: sellerId,
      scheduled_at: "2026-09-14T14:00:00Z",
    });
  }

  // Honest listing activity for the seller dashboard (views / saves as events).
  const viewDays = 18;
  for (let i = 0; i < viewDays; i++) {
    const day = new Date(Date.UTC(2026, 9, 1 + i, 14, 0, 0));
    const count = 4 + ((i * 3) % 11);
    for (let n = 0; n < count; n++) {
      await admin.from("events").insert({
        deal_id: dealId,
        actor_id: null,
        type: "listing.viewed",
        payload: { listing_id: demoListingId, source: "public" } as Json,
        created_at: new Date(day.getTime() + n * 60_000).toISOString(),
      });
    }
  }
  for (let i = 0; i < 14; i++) {
    await admin.from("events").insert({
      deal_id: dealId,
      actor_id: buyerId,
      type: "listing.saved",
      payload: { listing_id: demoListingId } as Json,
      created_at: new Date(Date.UTC(2026, 9, 5 + (i % 10), 16, i, 0)).toISOString(),
    });
  }

  // Buyer saved homes include the secondary live listing.
  const ppwListingId = stableUuid("listing:88-prospect-park-west");
  await admin.from("saved_homes").upsert(
    { user_id: buyerId, listing_id: ppwListingId },
    { onConflict: "user_id,listing_id" },
  );
  await admin.from("saved_homes").upsert(
    { user_id: buyerId, listing_id: demoListingId },
    { onConflict: "user_id,listing_id" },
  );

  await admin.from("events").insert({
    deal_id: dealId,
    actor_id: brokerId,
    type: "verification.funds_confirmed",
    payload: { user_id: buyerId } as Json,
    created_at: "2026-10-09T16:00:00Z",
  });

  console.log("Seed complete.");
  console.log("Sign-in accounts ready: seller@realora.dev, buyer@realora.dev, broker@realora.dev");
  console.log("(Passwords were supplied via env and are not printed.)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
