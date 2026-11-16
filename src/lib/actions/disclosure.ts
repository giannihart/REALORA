"use server";

import { insertEvent, isSellerSide, loadParties, requireActor } from "@/lib/actions/actor";
import { DealActionError, wrapError, type ActionResult } from "@/lib/actions/errors";
import { getSnapshotAction, type AppSnapshot } from "@/lib/actions/snapshot";
import { loadBrokerageIdentity } from "@/lib/compliance/identity";
import type { Json } from "@/lib/database.types";
import {
  agencyDisclosureTemplate,
  dualAgencyTemplate,
  renderTemplatePdf,
} from "@/lib/templates";

async function fresh(): Promise<ActionResult<AppSnapshot>> {
  return getSnapshotAction();
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

async function listingAddress(
  admin: Awaited<ReturnType<typeof requireActor>>["admin"],
  dealId: string,
) {
  const { data: deal } = await admin.from("deals").select("listing_id").eq("id", dealId).maybeSingle();
  if (!deal) throw new DealActionError("not_found", "Deal not found.");
  const { data: listing } = await admin.from("listings").select("property_id").eq("id", deal.listing_id).maybeSingle();
  const { data: property } = listing
    ? await admin.from("properties").select("address_line, borough, city, state, zip").eq("id", listing.property_id).maybeSingle()
    : { data: null };
  return [property?.address_line, property?.borough, property?.city, property?.state, property?.zip]
    .filter(Boolean)
    .join(", ");
}

async function resolveDealId(
  actor: Awaited<ReturnType<typeof requireActor>>,
  input: { dealId?: string; listingId?: string },
): Promise<string> {
  if (input.dealId) return input.dealId;
  if (input.listingId) {
    const { resolveListingRow } = await import("@/lib/actions/listing");
    const { listing } = await resolveListingRow(actor.admin, input.listingId);
    const { data: deal } = await actor.admin.from("deals").select("id").eq("listing_id", listing.id).maybeSingle();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    return deal.id;
  }
  const snap = await getSnapshotAction();
  if (!snap.ok || !snap.data.dealId) throw new DealActionError("not_found", "Deal not found.");
  return snap.data.dealId;
}

export async function acknowledgeAgencyDisclosureAction(input: {
  dealId?: string;
  listingId?: string;
}): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const dealId = await resolveDealId(actor, input);
    const address = await listingAddress(actor.admin, dealId);
    const identity = await loadBrokerageIdentity(actor.admin);
    const partyName = actor.profile.full_name || actor.email || "Party";
    const today = new Date().toISOString().slice(0, 10);
    const { storeGeneratedPdf } = await import("@/lib/actions/documents");
    const pdf = await renderTemplatePdf(
      agencyDisclosureTemplate({
        partyName,
        address,
        date: today,
        brokerageName: identity.legalName,
      }),
    );
    const name = `Agency Disclosure — ${partyName}`;
    const { data: existing } = await actor.admin
      .from("documents")
      .select("*")
      .eq("deal_id", dealId)
      .eq("name", name)
      .neq("status", "deleted")
      .maybeSingle();
    const now = new Date().toISOString();
    const extracted = {
      acknowledged_at: now,
      user_id: actor.userId,
      method: "click",
    } satisfies Json;
    let documentId = existing?.id;
    if (!existing) {
      const stored = await storeGeneratedPdf({
        actor,
        dealId,
        name,
        kind: "Disclosures",
        visibility: "shared",
        pdf,
        status: "completed",
        extracted,
      });
      documentId = stored.id;
    } else {
      await actor.admin
        .from("documents")
        .update({ status: "completed", extracted })
        .eq("id", existing.id);
    }
    await insertEvent(actor.admin, dealId, actor.userId, "disclosure.acknowledged", {
      document_id: documentId,
      at: now,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function acknowledgeDesignatedAgencyAction(dealId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const parties = await loadParties(actor.admin, dealId);
    const side = isSellerSide(parties, actor.userId)
      ? "seller"
      : parties.some((p) => p.user_id === actor.userId && p.side === "buyer")
        ? "buyer"
        : null;
    if (!side) throw new DealActionError("forbidden", "Only a party to this deal may acknowledge designated agency.");
    const address = await listingAddress(actor.admin, dealId);
    const identity = await loadBrokerageIdentity(actor.admin);
    const seller = parties.find((p) => p.role === "seller");
    const buyer = parties.find((p) => p.role === "buyer");
    const { data: sellerP } = seller
      ? await actor.admin.from("profiles").select("full_name").eq("id", seller.user_id).maybeSingle()
      : { data: null };
    const { data: buyerP } = buyer
      ? await actor.admin.from("profiles").select("full_name").eq("id", buyer.user_id).maybeSingle()
      : { data: null };
    const today = new Date().toISOString().slice(0, 10);
    const name = side === "seller" ? "Designated agency consent — Seller" : "Designated agency consent — Buyer";
    const pdf = await renderTemplatePdf(
      dualAgencyTemplate({
        sellerName: sellerP?.full_name || "Seller",
        buyerName: buyerP?.full_name || "Buyer",
        address,
        date: today,
        brokerageName: identity.legalName,
      }),
    );
    const { storeGeneratedPdf } = await import("@/lib/actions/documents");
    const now = new Date().toISOString();
    const extracted = {
      acknowledged_at: now,
      user_id: actor.userId,
      method: "click",
      [`${side}_acknowledged_at`]: now,
    } as Json;
    const { data: existing } = await actor.admin
      .from("documents")
      .select("*")
      .eq("deal_id", dealId)
      .eq("name", name)
      .neq("status", "deleted")
      .maybeSingle();
    if (!existing) {
      await storeGeneratedPdf({
        actor,
        dealId,
        name,
        kind: "Disclosures",
        visibility: "shared",
        pdf,
        status: "completed",
        extracted,
      });
    } else {
      const prev = asRecord(existing.extracted);
      await actor.admin
        .from("documents")
        .update({
          status: "completed",
          extracted: { ...prev, ...(extracted as Record<string, unknown>) } as Json,
        })
        .eq("id", existing.id);
    }
    await insertEvent(actor.admin, dealId, actor.userId, "designated_agency.acknowledged", {
      side,
      at: now,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}
