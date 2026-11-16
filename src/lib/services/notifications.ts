import "server-only";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { publicSupabaseUrl } from "@/lib/supabase/env";
import { renderNotification, type TemplateKey } from "@/lib/templates/notifications";
import { resendConfigured, twilioConfigured } from "@/lib/site";

type Admin = ReturnType<typeof adminClient>;

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(publicSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Prefs = { email?: boolean; sms?: boolean | "deadline_critical" };

function prefsFrom(raw: unknown): Prefs {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    return {
      email: rec.email !== false,
      sms: rec.sms === true ? true : rec.sms === false ? false : "deadline_critical",
    };
  }
  return { email: true, sms: "deadline_critical" };
}

async function logRow(
  admin: Admin,
  row: Database["public"]["Tables"]["notifications"]["Insert"],
) {
  await admin.from("notifications").insert(row);
}

type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  attachments?: EmailAttachment[],
): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const resend = new Resend(key);
  const from = process.env.RESEND_FROM || "REALORA <notifications@realora.dev>";
  const result = await resend.emails.send({
    from,
    to,
    subject,
    text: body,
    ...(attachments?.length
      ? {
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
        }
      : {}),
  });
  if (result.error) throw new Error(result.error.message);
  return result.data?.id ?? null;
}

/**
 * Direct lender-packet delivery. Returns sent vs prepared (logged-only when
 * Resend is unconfigured). Never claims sent without a provider id.
 */
export async function deliverLenderPacketEmail(input: {
  userId: string;
  to: string;
  subject: string;
  body: string;
  pdfBytes: Uint8Array;
  filename: string;
  packetId: string;
}): Promise<{ status: "sent" | "prepared"; providerId: string | null }> {
  const admin = adminClient();
  const attachment: EmailAttachment = {
    filename: input.filename,
    content: Buffer.from(input.pdfBytes),
    contentType: "application/pdf",
  };

  if (!resendConfigured()) {
    await logRow(admin, {
      user_id: input.userId,
      deal_id: null,
      channel: "email",
      template_key: "lender_packet.introduction",
      payload: {
        packet_id: input.packetId,
        to: input.to,
        subject: input.subject,
        mode: "logged_only",
      } as Json,
      status: "logged_only",
    });
    return { status: "prepared", providerId: null };
  }

  try {
    const providerId = await sendEmail(input.to, input.subject, input.body, [
      attachment,
    ]);
    await logRow(admin, {
      user_id: input.userId,
      deal_id: null,
      channel: "email",
      template_key: "lender_packet.introduction",
      payload: {
        packet_id: input.packetId,
        to: input.to,
        subject: input.subject,
      } as Json,
      status: "sent",
      provider_id: providerId,
    });
    return { status: "sent", providerId };
  } catch (err) {
    await logRow(admin, {
      user_id: input.userId,
      deal_id: null,
      channel: "email",
      template_key: "lender_packet.introduction",
      payload: {
        packet_id: input.packetId,
        to: input.to,
        subject: input.subject,
        error: err instanceof Error ? err.message : "email failed",
      } as Json,
      status: "failed",
    });
    // Soft-fail for the buyer: packet stays prepared (internal failed logged).
    return { status: "prepared", providerId: null };
  }
}

async function sendSms(to: string, body: string): Promise<string | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return null;
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const json = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(json.message ?? `Twilio ${res.status}`);
  return json.sid ?? null;
}

export async function notify(
  userId: string | null,
  templateKey: TemplateKey,
  payload: Record<string, unknown>,
  opts: { dealId?: string | null; email?: string; phone?: string } = {},
): Promise<void> {
  try {
    const admin = adminClient();
    let email = opts.email ?? "";
    let phone = opts.phone ?? "";
    let prefs: Prefs = { email: true, sms: "deadline_critical" };
    if (userId) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email, phone, notification_prefs")
        .eq("id", userId)
        .maybeSingle();
      email = email || profile?.email || "";
      phone = phone || profile?.phone || "";
      prefs = prefsFrom(profile?.notification_prefs);
    }
    const rendered = renderNotification(templateKey, payload);
    const wantEmail = prefs.email !== false;
    const wantSms =
      prefs.sms === true || (prefs.sms === "deadline_critical" && rendered.critical);

    if (wantEmail && email && resendConfigured()) {
      try {
        const providerId = await sendEmail(email, rendered.subject, rendered.body);
        await logRow(admin, {
          user_id: userId,
          deal_id: opts.dealId ?? null,
          channel: "email",
          template_key: templateKey,
          payload: payload as Json,
          status: "sent",
          provider_id: providerId,
        });
      } catch (err) {
        await logRow(admin, {
          user_id: userId,
          deal_id: opts.dealId ?? null,
          channel: "email",
          template_key: templateKey,
          payload: { ...payload, error: err instanceof Error ? err.message : "email failed" } as Json,
          status: "failed",
        });
      }
    } else if (wantEmail) {
      await logRow(admin, {
        user_id: userId,
        deal_id: opts.dealId ?? null,
        channel: email ? "email" : "log",
        template_key: templateKey,
        payload: payload as Json,
        status: "logged_only",
      });
    }

    if (wantSms && phone && twilioConfigured()) {
      try {
        const providerId = await sendSms(phone, rendered.sms);
        await logRow(admin, {
          user_id: userId,
          deal_id: opts.dealId ?? null,
          channel: "sms",
          template_key: templateKey,
          payload: payload as Json,
          status: "sent",
          provider_id: providerId,
        });
      } catch (err) {
        await logRow(admin, {
          user_id: userId,
          deal_id: opts.dealId ?? null,
          channel: "sms",
          template_key: templateKey,
          payload: { ...payload, error: err instanceof Error ? err.message : "sms failed" } as Json,
          status: "failed",
        });
      }
    } else if (wantSms && rendered.critical) {
      await logRow(admin, {
        user_id: userId,
        deal_id: opts.dealId ?? null,
        channel: phone ? "sms" : "log",
        template_key: templateKey,
        payload: payload as Json,
        status: "logged_only",
      });
    }
  } catch (err) {
    console.error("notify failed", err);
  }
}
