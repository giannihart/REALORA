/**
 * Upsert demo marketplace homes (for sale + sold) without a full project seed.
 * Usage: npx tsx scripts/seed-marketplace.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DEMO_LISTING_ID, listings } from "../src/data/seed";
import { dollarsToCents, acrisFromListing, mediaFromListing } from "../src/lib/data/map";
import type { Database } from "../src/lib/database.types";

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

async function main() {
  const scenarioListingIds = new Set([DEMO_LISTING_ID, "88-prospect-park-west"]);
  const catalog = listings.filter(
    (l) =>
      l.marketplace &&
      (l.status === "live" || l.status === "closed") &&
      !scenarioListingIds.has(l.id),
  );

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email")
    .in("email", ["listing-owner-ppw@realora.dev", "seller@realora.dev", "broker@realora.dev"]);
  const ownerId =
    profiles?.find((p) => p.email === "listing-owner-ppw@realora.dev")?.id ??
    profiles?.find((p) => p.email === "seller@realora.dev")?.id ??
    profiles?.find((p) => p.email === "broker@realora.dev")?.id ??
    null;
  if (!ownerId) {
    console.error("No seller profile found. Run the full seed first (npm run seed).");
    process.exit(1);
  }

  let live = 0;
  let sold = 0;
  for (const listing of catalog) {
    const propertyId = stableUuid(`property:${listing.id}`);
    const listingId = stableUuid(`listing:${listing.id}`);
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
      acris_payload: acrisFromListing(listing),
    });
    await admin.from("listings").upsert({
      id: listingId,
      property_id: propertyId,
      seller_id: ownerId,
      status: listing.status === "closed" ? "closed" : "live",
      price_cents: dollarsToCents(listing.price),
      description: listing.about.join("\n\n"),
      media: mediaFromListing(listing),
      buyer_agent_offered: listing.offerBuyerAgentPercent === 1,
    });
    if (listing.status === "closed") sold += 1;
    else live += 1;
  }

  console.log(`Upserted ${live} for-sale and ${sold} sold demo homes (${catalog.length} total).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
