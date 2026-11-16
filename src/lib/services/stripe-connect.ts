import Stripe from "stripe";
import { siteUrl, stripeConfigured } from "@/lib/site";

let client: Stripe | null = null;

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured.");
  if (!client) client = new Stripe(key);
  return client;
}

export { stripeConfigured };

/**
 * Destination charge on the platform account, transfer_data.destination = connected
 * vendor account, application_fee_amount = 0. Chosen so money_events and webhooks
 * stay on the platform account while v1 takes no cut on services.
 */
export async function createConnectAccount(email: string): Promise<string> {
  const account = await stripeClient().accounts.create({
    type: "express",
    country: "US",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
  return account.id;
}

export async function createOnboardingLink(accountId: string): Promise<string> {
  const link = await stripeClient().accountLinks.create({
    account: accountId,
    refresh_url: `${siteUrl()}/portal/seller/services?connect=refresh`,
    return_url: `${siteUrl()}/portal/seller/services?connect=done`,
    type: "account_onboarding",
  });
  return link.url;
}

export async function createVendorCheckout(input: {
  jobId: string;
  dealId: string;
  vendorAccountId: string;
  service: string;
  priceCents: number;
  successPath: string;
  cancelPath: string;
}): Promise<{ url: string; paymentIntent: string | null }> {
  const session = await stripeClient().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.priceCents,
          product_data: { name: input.service },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: 0,
      transfer_data: { destination: input.vendorAccountId },
    },
    success_url: `${siteUrl()}${input.successPath}?job=${input.jobId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}${input.cancelPath}`,
    metadata: {
      service_job_id: input.jobId,
      deal_id: input.dealId,
    },
  });
  return { url: session.url ?? "", paymentIntent: (session.payment_intent as string | null) ?? null };
}

export function constructStripeEvent(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  return stripeClient().webhooks.constructEvent(rawBody, signature, secret);
}
