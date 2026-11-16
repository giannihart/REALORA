"use server";

import {
  insertEvent,
  isStaff,
  loadParties,
  requireActor,
  type Actor,
} from "@/lib/actions/actor";
import { DealActionError, fail, wrapError, type ActionResult } from "@/lib/actions/errors";
import { getSnapshotAction, type AppSnapshot } from "@/lib/actions/snapshot";
import { generateFeeInvoicePdf } from "@/lib/documents/fee-invoice";
import {
  createConnectAccount,
  createOnboardingLink,
  createVendorCheckout,
  stripeConfigured,
} from "@/lib/services/stripe-connect";
import type { Json, Tables } from "@/lib/database.types";

async function fresh(): Promise<ActionResult<AppSnapshot>> {
  return getSnapshotAction();
}

function detailsOf(vendor: Tables<"vendors">): Record<string, unknown> {
  const details = vendor.details;
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : {};
}

async function findVendor(actor: Actor, vendorId: string): Promise<Tables<"vendors"> | null> {
  const { data: byId } = await actor.admin.from("vendors").select("*").eq("id", vendorId).maybeSingle();
  if (byId) return byId;
  const { data: all } = await actor.admin.from("vendors").select("*");
  return (
    (all ?? []).find((row) => {
      const details = detailsOf(row);
      return details.slug === vendorId;
    }) ?? null
  );
}

export async function startVendorConnectAction(
  vendorId?: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    const actor = await requireActor();
    if (!stripeConfigured()) {
      return fail("validation", "Vendor payouts are not configured.");
    }
    let vendor: Tables<"vendors"> | null = null;
    if (vendorId) {
      vendor = await findVendor(actor, vendorId);
    } else {
      const { data } = await actor.admin
        .from("vendors")
        .select("*")
        .eq("user_id", actor.userId)
        .maybeSingle();
      vendor = data;
    }
    if (!vendor) throw new DealActionError("not_found", "Vendor profile not found.");
    const mine = vendor.user_id === actor.userId;
    if (!mine && !isStaff(actor)) {
      throw new DealActionError("forbidden", "Only the vendor or a broker may start payout setup.");
    }
    let accountId = vendor.stripe_connect_id;
    if (!accountId) {
      accountId = await createConnectAccount(actor.email || actor.profile.email || "");
      await actor.admin.from("vendors").update({ stripe_connect_id: accountId }).eq("id", vendor.id);
    }
    const url = await createOnboardingLink(accountId);
    return { ok: true, data: { url } };
  } catch (error) {
    return wrapError(error);
  }
}

export async function startVendorBookingAction(
  vendorId: string,
  date: string,
  time: string,
): Promise<ActionResult<{ snapshot: AppSnapshot; checkoutUrl?: string; blocked?: string }>> {
  try {
    const actor = await requireActor();
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    const dealId = snap.data.dealId;
    const parties = await loadParties(actor.admin, dealId);
    const onDeal = parties.some((p) => p.user_id === actor.userId) || isStaff(actor);
    if (!onDeal) throw new DealActionError("forbidden", "You are not a party to this deal.");

    const vendor = await findVendor(actor, vendorId);
    if (!vendor || !vendor.active) throw new DealActionError("not_found", "Vendor not found.");
    const details = detailsOf(vendor);
    const priceDollars = typeof details.price === "number" ? details.price : 0;
    const priceCents = Math.round(priceDollars * 100);
    const service =
      typeof details.category === "string" ? details.category : vendor.services[0] || vendor.business_name;
    const scheduledAt = date && time ? `${date}T${time}:00` : null;

    const ready = Boolean(vendor.stripe_connect_id && vendor.charges_enabled);
    if (!stripeConfigured() || !ready) {
      return {
        ok: true,
        data: {
          snapshot: snap.data,
          blocked: "Vendor setup required — this vendor cannot take paid bookings yet.",
        },
      };
    }

    const { data: job, error } = await actor.admin
      .from("service_jobs")
      .insert({
        deal_id: dealId,
        vendor_id: vendor.id,
        buyer_or_seller_payer: actor.userId,
        service,
        price_cents: priceCents,
        status: "requested",
        scheduled_at: scheduledAt,
      })
      .select("*")
      .single();
    if (error || !job) throw new DealActionError("validation", error?.message ?? "Could not create job.");

    const checkout = await createVendorCheckout({
      jobId: job.id,
      dealId,
      vendorAccountId: vendor.stripe_connect_id as string,
      service: `${vendor.business_name} — ${service}`,
      priceCents,
      successPath: snap.data.user.role === "seller" ? "/portal/seller/services" : "/portal/buyer/services",
      cancelPath: snap.data.user.role === "seller" ? "/portal/seller/services" : "/portal/buyer/services",
    });
    if (checkout.paymentIntent) {
      await actor.admin
        .from("service_jobs")
        .update({ stripe_payment_intent: checkout.paymentIntent })
        .eq("id", job.id);
    }
    await insertEvent(actor.admin, dealId, actor.userId, "vendor.booked", {
      vendor_id: vendor.id,
      job_id: job.id,
      date,
      time,
    });
    if (/inspector/i.test(service)) {
      const { data: tasks } = await actor.admin
        .from("tasks")
        .select("id, title, status")
        .eq("deal_id", dealId);
      const inspection = (tasks ?? []).find((t) => /schedule inspection/i.test(t.title));
      if (inspection && inspection.status !== "done") {
        await actor.admin.from("tasks").update({ status: "done" }).eq("id", inspection.id);
      }
    }
    const next = await fresh();
    return {
      ok: true,
      data: {
        snapshot: next.ok ? next.data : snap.data,
        checkoutUrl: checkout.url,
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}

export async function confirmServiceJobAction(jobId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { data: job } = await actor.admin.from("service_jobs").select("*").eq("id", jobId).maybeSingle();
    if (!job) throw new DealActionError("not_found", "Job not found.");
    const { data: vendor } = await actor.admin.from("vendors").select("*").eq("id", job.vendor_id).maybeSingle();
    const allowed = vendor?.user_id === actor.userId || isStaff(actor);
    if (!allowed) throw new DealActionError("forbidden", "Only the vendor may confirm this job.");
    if (job.status !== "paid" && job.status !== "requested") {
      throw new DealActionError("wrong_state", "This job cannot be confirmed from its current status.");
    }
    await actor.admin.from("service_jobs").update({ status: "confirmed" }).eq("id", job.id);
    await insertEvent(actor.admin, job.deal_id, actor.userId, "vendor.confirmed", { job_id: job.id });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function completeServiceJobAction(formData: FormData): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const jobId = String(formData.get("jobId") ?? "");
    const { data: job } = await actor.admin.from("service_jobs").select("*").eq("id", jobId).maybeSingle();
    if (!job) throw new DealActionError("not_found", "Job not found.");
    const { data: vendor } = await actor.admin.from("vendors").select("*").eq("id", job.vendor_id).maybeSingle();
    if (vendor?.user_id !== actor.userId && !isStaff(actor)) {
      throw new DealActionError("forbidden", "Only the vendor may complete this job.");
    }
    const file = formData.get("file");
    let documentId: string | null = null;
    if (file instanceof File && file.size > 0) {
      const id = crypto.randomUUID();
      const filename = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "report.pdf";
      const path = `${job.deal_id}/${id}/${filename}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await actor.admin.storage.from("deal-documents").upload(path, buffer, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });
      if (upErr) throw new DealActionError("validation", upErr.message);
      const { error } = await actor.admin.from("documents").insert({
        id,
        deal_id: job.deal_id,
        uploader_id: actor.userId,
        name: file.name,
        kind: "inspection_report",
        storage_path: path,
        status: "Pending",
        visibility: "shared",
      });
      if (error) throw new DealActionError("validation", error.message);
      documentId = id;
      await insertEvent(actor.admin, job.deal_id, actor.userId, "document.uploaded", {
        document_id: id,
        name: file.name,
        visibility: "shared",
      });
    }
    await actor.admin
      .from("service_jobs")
      .update({ status: "completed", deliverable_document_id: documentId })
      .eq("id", job.id);

    const { data: tasks } = await actor.admin.from("tasks").select("*").eq("deal_id", job.deal_id);
    const inspection = (tasks ?? []).find((t) => /schedule inspection/i.test(t.title));
    if (inspection && inspection.status !== "done") {
      await actor.admin
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", inspection.id);
    }
    await insertEvent(actor.admin, job.deal_id, actor.userId, "vendor.completed", {
      job_id: job.id,
      document_id: documentId,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function disburseFeeAction(): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    if (!isStaff(actor)) throw new DealActionError("forbidden", "Only a broker may mark fees disbursed.");
    const snap = await getSnapshotAction();
    if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
    const dealId = snap.data.dealId;
    await actor.admin
      .from("money_events")
      .update({ status: "disbursed" })
      .eq("deal_id", dealId)
      .in("kind", ["platform_fee", "buyer_agent_fee"]);
    await actor.admin
      .from("documents")
      .update({ status: "disbursed" })
      .eq("deal_id", dealId)
      .eq("kind", "fee_invoice");
    await insertEvent(actor.admin, dealId, actor.userId, "fee.disbursed", {});
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function generateClosingFeeInvoice(
  actor: Actor,
  deal: Tables<"deals">,
  listing: Tables<"listings"> | null,
  accepted: Tables<"offers"> | null,
  platformFee: number,
  hadAgent: boolean,
): Promise<void> {
  const { data: property } = listing
    ? await actor.admin.from("properties").select("*").eq("id", listing.property_id).maybeSingle()
    : { data: null };
  const address = property?.address_line ?? "the property";
  const price = Number(accepted?.price_cents ?? listing?.price_cents ?? 0);
  const buyerAgent =
    listing?.buyer_agent_offered && hadAgent ? platformFee : null;
  const pdf = await generateFeeInvoicePdf({
    address,
    priceCents: price,
    platformFeeCents: platformFee,
    buyerAgentFeeCents: buyerAgent,
    issuedAt: new Date().toISOString(),
  });
  const id = crypto.randomUUID();
  const path = `${deal.id}/${id}/realora-fee-invoice.pdf`;
  await actor.admin.storage.from("deal-documents").upload(path, Buffer.from(pdf), {
    contentType: "application/pdf",
    upsert: false,
  });
  await actor.admin.from("documents").insert({
    id,
    deal_id: deal.id,
    uploader_id: actor.userId,
    name: "REALORA fee invoice",
    kind: "fee_invoice",
    storage_path: path,
    status: "issued",
    visibility: "shared",
    extracted: {
      platform_fee_cents: platformFee,
      buyer_agent_fee_cents: buyerAgent,
      price_cents: price,
    } as unknown as Json,
  });
  await insertEvent(actor.admin, deal.id, actor.userId, "document.uploaded", {
    document_id: id,
    name: "REALORA fee invoice",
    visibility: "shared",
  });
}

export async function applyPaidJobFromStripe(jobId: string, paymentIntent: string | null, amountCents: number) {
  const { createServiceRoleClient } = await import("@/lib/supabase/admin");
  const admin = createServiceRoleClient();
  const { data: job } = await admin.from("service_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return;
  await admin
    .from("service_jobs")
    .update({
      status: "paid",
      stripe_payment_intent: paymentIntent ?? job.stripe_payment_intent,
    })
    .eq("id", job.id);
  await admin.from("money_events").insert({
    deal_id: job.deal_id,
    kind: "vendor_payment",
    amount_cents: amountCents || job.price_cents,
    status: "paid",
    note: `Service job ${job.id}${paymentIntent ? ` · ${paymentIntent}` : ""}`,
  });
  await insertEvent(admin, job.deal_id, job.buyer_or_seller_payer, "vendor.paid", {
    job_id: job.id,
    payment_intent: paymentIntent,
  });
}

void fail;
