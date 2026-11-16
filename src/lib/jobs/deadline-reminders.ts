import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicSupabaseUrl } from "@/lib/supabase/env";
import { notify } from "@/lib/services/notifications";
import { siteUrl } from "@/lib/site";
import type { TemplateKey } from "@/lib/templates/notifications";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(publicSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

type WindowKey = "48h" | "24h" | "due";

const TEMPLATE: Record<WindowKey, TemplateKey> = {
  "48h": "reminder.48h",
  "24h": "reminder.24h",
  due: "reminder.due",
};

export async function runDeadlineReminders(now = new Date()): Promise<{ sent: number; skipped: number }> {
  const admin = adminClient();
  const today = ymd(now);
  const in24 = ymd(addDays(now, 1));
  const in48 = ymd(addDays(now, 2));
  const { data: tasks, error } = await admin
    .from("tasks")
    .select("*")
    .in("status", ["pending", "in_progress", "waiting"])
    .in("due_date", [today, in24, in48]);
  if (error) throw new Error(error.message);

  let sent = 0;
  let skipped = 0;
  for (const task of tasks ?? []) {
    if (!task.due_date) continue;
    const window: WindowKey | null =
      task.due_date === in48 ? "48h" : task.due_date === in24 ? "24h" : task.due_date === today ? "due" : null;
    if (!window) continue;
    const templateKey = TEMPLATE[window];
    const { data: existing } = await admin
      .from("notifications")
      .select("id, payload")
      .eq("deal_id", task.deal_id)
      .eq("template_key", templateKey);
    const already = (existing ?? []).some((row) => {
      const p =
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {};
      return p.task_id === task.id && p.window === window;
    });
    if (already) {
      skipped += 1;
      continue;
    }

    const { data: parties } = await admin.from("deal_parties").select("*").eq("deal_id", task.deal_id);
    let ownerIds = task.owner_user_id ? [task.owner_user_id] : [];
    if (!ownerIds.length && task.owner_role) {
      ownerIds = (parties ?? []).filter((p) => p.role === task.owner_role).map((p) => p.user_id);
    }
    const { data: deal } = await admin.from("deals").select("listing_id").eq("id", task.deal_id).maybeSingle();
    let address = "the property";
    if (deal) {
      const { data: listing } = await admin
        .from("listings")
        .select("property_id")
        .eq("id", deal.listing_id)
        .maybeSingle();
      if (listing) {
        const { data: property } = await admin
          .from("properties")
          .select("address_line")
          .eq("id", listing.property_id)
          .maybeSingle();
        address = property?.address_line ?? address;
      }
    }
    const payload = {
      address,
      title: task.title,
      due: task.due_date,
      task_id: task.id,
      window,
      link: `${siteUrl()}/portal`,
    };
    if (!ownerIds.length) {
      await notify(null, templateKey, payload, { dealId: task.deal_id });
      sent += 1;
      continue;
    }
    for (const id of ownerIds) {
      await notify(id, templateKey, payload, { dealId: task.deal_id });
      sent += 1;
    }
  }
  return { sent, skipped };
}
