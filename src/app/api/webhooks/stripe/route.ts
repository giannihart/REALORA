import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { insertEvent } from "@/lib/actions/actor";
import { applyPaidJobFromStripe } from "@/lib/actions/vendor";
import { constructStripeEvent, stripeClient, stripeConfigured } from "@/lib/services/stripe-connect";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ ok: false, error: "stripe not configured" }, { status: 503 });
  }
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = constructStripeEvent(raw, signature);
    } else {
      event = JSON.parse(raw) as Stripe.Event;
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "invalid payload" },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const jobId = session.metadata?.service_job_id;
    const pi =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    if (jobId) {
      await applyPaidJobFromStripe(jobId, pi, session.amount_total ?? 0);
    }
  }

  if (event.type === "charge.refunded" || event.type === "charge.refund.updated") {
    const charge = event.data.object as Stripe.Charge;
    const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (pi) {
      const { data: job } = await admin
        .from("service_jobs")
        .select("*")
        .eq("stripe_payment_intent", pi)
        .maybeSingle();
      if (job) {
        await admin.from("money_events").insert({
          deal_id: job.deal_id,
          kind: "vendor_refund",
          amount_cents: charge.amount_refunded ?? job.price_cents,
          status: "refunded",
          note: `Refund for job ${job.id}`,
        });
        await insertEvent(admin, job.deal_id, null, "vendor.refunded", {
          job_id: job.id,
          payment_intent: pi,
        });
      }
    }
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    await admin
      .from("vendors")
      .update({
        charges_enabled: Boolean(account.charges_enabled),
      })
      .eq("stripe_connect_id", account.id);
  }

  void stripeClient;
  return NextResponse.json({ ok: true });
}
