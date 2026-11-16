/**
 * Wipe buyer/seller transactional data and per-profile attributes.
 * Keeps auth users + bare profiles (email, name, app_role).
 *
 *   npx tsx scripts/clean-profiles.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
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

async function wipe(table: keyof Database["public"]["Tables"], label = table) {
  const { error, count } = await admin
    .from(table)
    .delete({ count: "exact" })
    .gte("created_at", "1970-01-01");
  if (error) {
    // Some tables lack created_at — fall back to a broad delete.
    const retry = await admin.from(table).delete().neq("id" as never, "00000000-0000-0000-0000-000000000000" as never);
    if (retry.error) {
      console.warn(`  skip ${label}: ${error.message} / ${retry.error.message}`);
      return;
    }
  }
  console.log(`  cleared ${label}${count != null ? ` (${count})` : ""}`);
}

async function main() {
  console.log("Wiping transactional data…");

  // Child → parent order where it matters.
  const tables: (keyof Database["public"]["Tables"])[] = [
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
    "approvals",
    "listings",
    "properties",
  ];

  for (const table of tables) {
    // events uses numeric id; deal_parties has no useful neq on all rows via created_at always
    if (table === "events") {
      const { error } = await admin.from("events").delete().gt("id", 0);
      if (error) console.warn(`  events: ${error.message}`);
      else console.log("  cleared events");
      continue;
    }
    if (table === "deal_parties") {
      const { error } = await admin
        .from("deal_parties")
        .delete()
        .neq("user_id", "00000000-0000-0000-0000-000000000000");
      if (error) console.warn(`  deal_parties: ${error.message}`);
      else console.log("  cleared deal_parties");
      continue;
    }
    if (table === "saved_homes") {
      const { error } = await admin.from("saved_homes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) console.warn(`  saved_homes: ${error.message}`);
      else console.log("  cleared saved_homes");
      continue;
    }
    await wipe(table);
  }

  // buying_power has user_id PK, no created_at filter needed
  {
    const { error } = await admin
      .from("buying_power_profiles")
      .delete()
      .neq("user_id", "00000000-0000-0000-0000-000000000000");
    if (error) console.warn(`  buying_power_profiles: ${error.message}`);
    else console.log("  cleared buying_power_profiles");
  }

  console.log("Resetting profile attributes…");
  const { data: profiles, error: profileErr } = await admin.from("profiles").select("id, email, app_role");
  if (profileErr) throw profileErr;

  for (const profile of profiles ?? []) {
    await admin
      .from("profiles")
      .update({
        intent: null,
        phone: null,
        notification_prefs: {} as Database["public"]["Tables"]["profiles"]["Row"]["notification_prefs"],
      })
      .eq("id", profile.id);

    await admin.from("verifications").upsert({
      user_id: profile.id,
      tier: 0,
      id_status: "pending",
      funds_status: "pending",
      method: null,
      verified_at: null,
      persona_inquiry_id: null,
    });

    console.log(`  cleaned ${profile.email ?? profile.id} (${profile.app_role})`);
  }

  console.log("Done. Auth accounts kept; deals, listings, saves, buying power, and verification facts cleared.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
