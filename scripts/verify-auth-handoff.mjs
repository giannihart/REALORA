/**
 * Walks the auth + sell handoff seams against the linked Supabase project.
 * Usage: node scripts/verify-auth-handoff.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
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
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.error("Need Supabase env.");
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

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed += 1;
}

const stamp = randomBytes(3).toString("hex");
const freshEmail = `gianni.handoff.${stamp}@realora.test`;
const freshPass = "RealoraTest!handoff1";

async function main() {
  // Seed sign-ins
  for (const [email, password] of [
    ["seller@realora.dev", "RealoraDev!seller"],
    ["buyer@realora.dev", "RealoraDev!buyer"],
    ["broker@realora.dev", "RealoraDev!broker"],
  ]) {
    const client = userClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    check(`seed sign-in ${email}`, !error, error?.message);
    await client.auth.signOut();
  }

  // Wrong password
  {
    const client = userClient();
    const { error } = await client.auth.signInWithPassword({
      email: "seller@realora.dev",
      password: "definitely-wrong",
    });
    check("wrong password rejected", !!error, error?.message);
  }

  // Fresh sign-up via admin path (same as signUpAction)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: freshEmail,
    password: freshPass,
    email_confirm: true,
    user_metadata: { full_name: "Gianni Handoff" },
  });
  check("fresh sign-up createUser", !createErr && !!created.user, createErr?.message);
  if (created.user) {
    await admin.from("profiles").update({ intent: "selling", full_name: "Gianni Handoff" }).eq("id", created.user.id);
    const { data: ver } = await admin.from("verifications").select("tier").eq("user_id", created.user.id).maybeSingle();
    check("new account is Tier 0", (ver?.tier ?? 0) === 0, `tier=${ver?.tier}`);
  }

  // Duplicate
  {
    const { error } = await admin.auth.admin.createUser({
      email: freshEmail,
      password: freshPass,
      email_confirm: true,
    });
    check("duplicate email rejected", !!error, error?.message);
  }

  // Sign in fresh + create draft listing (tier 0 must work)
  {
    const client = userClient();
    const { data: session, error } = await client.auth.signInWithPassword({
      email: freshEmail,
      password: freshPass,
    });
    check("fresh account sign-in", !error && !!session.user, error?.message);

    const sellerId = session.user.id;
    const bbl = "3010000001";
    const addr = "123 Lincoln Place #2A";
    const { data: prop, error: propErr } = await admin
      .from("properties")
      .insert({
        bbl,
        address_line: addr,
        city: "Brooklyn",
        state: "NY",
        zip: "11217",
        borough: "Brooklyn",
        property_type: "Condo",
        beds: 2,
        baths: 1,
        sqft: 900,
        acris_payload: { title: addr, neighborhood: "Park Slope", fromOnboarding: true },
      })
      .select("id")
      .single();
    check("property insert", !propErr && !!prop, propErr?.message);

    if (prop) {
      const { data: listing, error: listErr } = await admin
        .from("listings")
        .insert({
          property_id: prop.id,
          seller_id: sellerId,
          status: "draft",
          price_cents: 419000000,
        })
        .select("id")
        .single();
      check("draft listing under fresh account", !listErr && !!listing, listErr?.message);

      if (listing) {
        const { data: again } = await admin
          .from("listings")
          .select("id, seller_id, status")
          .eq("id", listing.id)
          .maybeSingle();
        check(
          "listing owned by fresh seller",
          again?.seller_id === sellerId && again?.status === "draft",
        );
      }
    }
    await client.auth.signOut();
  }

  // Return visit
  {
    const client = userClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: freshEmail,
      password: freshPass,
    });
    check("return visit sign-in", !error && !!data.user, error?.message);
    if (data.user) {
      const { data: listings } = await admin
        .from("listings")
        .select("id, status")
        .eq("seller_id", data.user.id);
      check("return visit sees listing", (listings?.length ?? 0) >= 1, `count=${listings?.length}`);
    }
  }

  console.log(failed ? `\n${failed} failed` : "\nAll auth-handoff checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
