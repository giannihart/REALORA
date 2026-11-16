import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
import { notify } from "../src/lib/services/notifications";
import { runDeadlineReminders } from "../src/lib/jobs/deadline-reminders";
import { dispatchFromEvent } from "../src/lib/notifications/dispatch";
import { recomputeVerification } from "../src/lib/services/verification-persona";
import type { Database } from "../src/lib/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient<Database>(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [cmd, ...rest] = process.argv.slice(2);

async function main() {
  if (cmd === "notify-offer") {
    const [userId, dealId, site] = rest;
    await notify(
      userId || null,
      "offer.submitted",
      { address: "412 2nd Street", price: "$4,190,000", link: `${site}/portal/seller` },
      { dealId },
    );
    return;
  }
  if (cmd === "reminders") {
    const result = await runDeadlineReminders();
    console.log(JSON.stringify(result));
    return;
  }
  if (cmd === "messages") {
    const [dealId, actorId, thread] = rest;
    await dispatchFromEvent(admin, dealId, actorId || null, "message.sent", { thread_key: thread });
    await dispatchFromEvent(admin, dealId, actorId || null, "message.sent", { thread_key: thread });
    await dispatchFromEvent(admin, dealId, actorId || null, "message.sent", { thread_key: thread });
    return;
  }
  if (cmd === "persona") {
    const [userId] = rest;
    await recomputeVerification(userId, {
      id_status: "approved",
      persona_inquiry_id: "inq_r4_test",
      method: "persona",
      verified_at: new Date().toISOString(),
    });
    await recomputeVerification(userId, { funds_status: "verified" });
    return;
  }
  throw new Error(`Unknown command ${cmd}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
