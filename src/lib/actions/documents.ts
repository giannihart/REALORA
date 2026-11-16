"use server";

import { requireActor, insertEvent, insertTaskRows, isStaff, loadParties, hasRole, type Actor } from "@/lib/actions/actor";
import { DealActionError, fail, wrapError, type ActionResult } from "@/lib/actions/errors";
import { getSnapshotAction, type AppSnapshot } from "@/lib/actions/snapshot";
import {
  allowedUploadVisibilities,
  assertDocumentAccess,
  canAccessDocument,
  isSupervisor,
  type DocumentVisibility,
} from "@/lib/documents/access";
import type { Json, Tables } from "@/lib/database.types";
import type { ContractExtraction, ExtractedPayload } from "@/lib/services/extraction-types";
import { extractContractFromPdf, extractionAvailable } from "@/lib/services/extraction";
import { headers } from "next/headers";
import {
  createEmbeddedSigningSession,
  esignEnvironment,
} from "@/lib/services/esign";
import {
  NATIVE_CONSENT_TEXT,
  NATIVE_CONSENT_VERSION,
  sha256Hex,
  stampSignatureOntoPdf,
  type NativeCaptureMethod,
} from "@/lib/services/esign-native";
import {
  mergeEsignMeta,
  readEsignMeta,
  type SignatureEvidenceEntry,
} from "@/lib/documents/esign-meta";
import { emailExecutedAgreementCopy } from "@/lib/documents/executed-copy";
import {
  assertRenderableBrokerageIdentity,
  loadBrokerageIdentity,
} from "@/lib/compliance/identity";
import {
  agencyDisclosureTemplate,
  dualAgencyTemplate,
  exclusiveExpiresOn,
  leadPaintTemplate,
  listingAgreementTemplate,
  propertyConditionTemplate,
  renderTemplatePdf,
  renderTemplatePdfWithBlocks,
  sellerLoiTemplate,
} from "@/lib/templates";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { insertApprovalRequest } from "@/lib/actions/approvals";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);

async function fresh(): Promise<ActionResult<AppSnapshot>> {
  return getSnapshotAction();
}

function asVisibility(value: string | null | undefined): DocumentVisibility {
  if (value === "seller_side" || value === "buyer_side") return value;
  return "shared";
}

async function resolveDealForActor(actor: Actor, dealId?: string | null) {
  const snap = await getSnapshotAction();
  const id = dealId || (snap.ok ? snap.data.dealId : null);
  if (!id) throw new DealActionError("not_found", "Deal not found.");
  const { data: deal } = await actor.admin.from("deals").select("*").eq("id", id).maybeSingle();
  if (!deal) throw new DealActionError("not_found", "Deal not found.");
  const parties = await loadParties(actor.admin, deal.id);
  if (!isStaff(actor) && !parties.some((p) => p.user_id === actor.userId)) {
    throw new DealActionError("forbidden", "You are not a party to this deal.");
  }
  return { deal, parties };
}

async function loadDocument(actor: Actor, documentId: string) {
  const { data: doc } = await actor.admin.from("documents").select("*").eq("id", documentId).maybeSingle();
  if (!doc || doc.status === "deleted") throw new DealActionError("not_found", "Document not found.");
  if (!doc.deal_id) {
    if (doc.uploader_id !== actor.userId && !isStaff(actor)) {
      throw new DealActionError("forbidden", "You cannot access this document.");
    }
    return { doc, parties: [] as Tables<"deal_parties">[] };
  }
  const parties = await loadParties(actor.admin, requireDocDealId(doc.deal_id));
  assertDocumentAccess(actor, parties, asVisibility(doc.visibility));
  return { doc, parties };
}

function requireDocDealId(dealId: string | null): string {
  if (!dealId) {
    throw new DealActionError("validation", "This document is not attached to a deal.");
  }
  return dealId;
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "document";
}

async function storePdf(input: {
  actor: Actor;
  dealId: string;
  name: string;
  kind: string;
  visibility: DocumentVisibility;
  pdf: Uint8Array;
  status?: string;
  extracted?: Json;
}): Promise<Tables<"documents">> {
  const id = crypto.randomUUID();
  const filename = `${safeFilename(input.name)}.pdf`;
  const path = `${input.dealId}/${id}/${filename}`;
  // TODO(R3): virus-scan hook — no scanner in R3
  const { error: upErr } = await input.actor.admin.storage.from("deal-documents").upload(path, input.pdf, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) throw new DealActionError("validation", upErr.message);
  const { data, error } = await input.actor.admin
    .from("documents")
    .insert({
      id,
      deal_id: input.dealId,
      uploader_id: input.actor.userId,
      name: input.name,
      kind: input.kind,
      storage_path: path,
      status: input.status ?? "Pending",
      visibility: input.visibility,
      extracted: input.extracted ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new DealActionError("validation", error?.message ?? "Could not store document.");
  await insertEvent(input.actor.admin, input.dealId, input.actor.userId, "document.uploaded", {
    document_id: id,
    name: input.name,
    visibility: input.visibility,
  });
  return data;
}

export const storeGeneratedPdf = storePdf;

export async function getSigningConfigAction(): Promise<
  ActionResult<{
    mode: "native";
    environment: "test" | "live" | "unavailable";
    extraction: boolean;
    clientId: string | null;
    brokerageName: string;
    licenseNumber: string;
    brokerOfRecordName: string;
    brokerOfRecordLicense: string;
    listingTermDays: number;
    protectionDays: number;
  }>
> {
  try {
    const identity = await loadBrokerageIdentity(createServiceRoleClient());
    if (!identity.placeholder) {
      const { notifyWaitingIntakeSellersAction } = await import("@/lib/actions/intake-hold");
      void notifyWaitingIntakeSellersAction();
    }
    return {
      ok: true,
      data: {
        mode: "native",
        environment: esignEnvironment(),
        extraction: extractionAvailable(),
        clientId: null,
        brokerageName: identity.legalName,
        licenseNumber: identity.licenseNumber,
        brokerOfRecordName: identity.brokerOfRecordName,
        brokerOfRecordLicense: identity.brokerOfRecordLicense,
        listingTermDays: identity.listingTermDays,
        protectionDays: identity.protectionDays,
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}

export async function uploadDealDocumentAction(formData: FormData): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const dealId = String(formData.get("dealId") ?? "");
    const visibility = asVisibility(String(formData.get("visibility") ?? "shared"));
    const kind = String(formData.get("kind") ?? "Closing");
    const label = String(formData.get("label") ?? "").trim();
    const { deal, parties } = await resolveDealForActor(actor, dealId || null);
    const allowed = allowedUploadVisibilities(actor, parties);
    if (!allowed.includes(visibility)) {
      throw new DealActionError("forbidden", "That visibility is outside your scope.");
    }
    const file = formData.get("file");
    if (!(file instanceof File)) return fail("validation", "Choose a file.");
    if (file.size > MAX_BYTES) return fail("validation", "File must be 25MB or smaller.");
    const type = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(type) && !file.name.toLowerCase().match(/\.(pdf|png|jpe?g|heic|heif)$/)) {
      return fail("validation", "PDF, PNG, JPEG, or HEIC only.");
    }
    // TODO(R3): virus-scan hook — no scanner in R3
    const id = crypto.randomUUID();
    const filename = safeFilename(file.name);
    const path = `${deal.id}/${id}/${filename}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = type.startsWith("image/") || type === "application/pdf" ? type : "application/pdf";
    const { error: upErr } = await actor.admin.storage.from("deal-documents").upload(path, buffer, {
      contentType,
      upsert: false,
    });
    if (upErr) throw new DealActionError("validation", upErr.message);
    const { error } = await actor.admin.from("documents").insert({
      id,
      deal_id: deal.id,
      uploader_id: actor.userId,
      name: label || file.name,
      kind,
      storage_path: path,
      status: "Pending",
      visibility,
    });
    if (error) throw new DealActionError("validation", error.message);
    await insertEvent(actor.admin, deal.id, actor.userId, "document.uploaded", {
      document_id: id,
      name: file.name,
      visibility,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

/** Ensure a non-marketplace prep deal exists so vault uploads work before an offer. */
async function ensureBuyerPrepDealId(actor: Actor): Promise<string> {
  const slug = `buyer-prep-${actor.userId}`;
  const { data: parties } = await actor.admin
    .from("deal_parties")
    .select("deal_id")
    .eq("user_id", actor.userId)
    .eq("role", "buyer");
  for (const party of parties ?? []) {
    const { data: deal } = await actor.admin
      .from("deals")
      .select("id, listing_id")
      .eq("id", party.deal_id)
      .maybeSingle();
    if (!deal) continue;
    const { data: listing } = await actor.admin
      .from("listings")
      .select("id, property_id")
      .eq("id", deal.listing_id)
      .maybeSingle();
    if (!listing) continue;
    const { data: property } = await actor.admin
      .from("properties")
      .select("acris_payload")
      .eq("id", listing.property_id)
      .maybeSingle();
    const payload =
      property?.acris_payload &&
      typeof property.acris_payload === "object" &&
      !Array.isArray(property.acris_payload)
        ? (property.acris_payload as Record<string, unknown>)
        : {};
    if (payload.slug === slug || payload.buyerPrep === true) return deal.id;
  }

  const { data: property, error: propErr } = await actor.admin
    .from("properties")
    .insert({
      address_line: "Buyer prep workspace",
      city: "New York",
      state: "NY",
      zip: "10001",
      borough: "Manhattan",
      beds: 0,
      baths: 0,
      sqft: 0,
      property_type: "Condo",
      acris_payload: {
        slug,
        buyerPrep: true,
        marketplace: false,
        title: "Buyer prep workspace",
      } as Json,
    })
    .select("id")
    .single();
  if (propErr || !property) {
    throw new DealActionError("validation", propErr?.message ?? "Could not create prep workspace.");
  }
  const { data: listing, error: listErr } = await actor.admin
    .from("listings")
    .insert({
      property_id: property.id,
      seller_id: actor.userId,
      status: "draft",
      price_cents: 0,
      media: [],
    })
    .select("id")
    .single();
  if (listErr || !listing) {
    throw new DealActionError("validation", listErr?.message ?? "Could not create prep listing.");
  }
  const { data: deal, error: dealErr } = await actor.admin
    .from("deals")
    .insert({ listing_id: listing.id, state: "tours_offers" })
    .select("id")
    .single();
  if (dealErr || !deal) {
    throw new DealActionError("validation", dealErr?.message ?? "Could not create prep deal.");
  }
  await actor.admin.from("deal_parties").upsert({
    deal_id: deal.id,
    user_id: actor.userId,
    role: "buyer",
    side: "buyer",
  });
  return deal.id;
}

/** Pre-offer PoF / pre-approval upload into the buyer's prep vault workspace. */
export async function uploadBuyerFinancingDocumentAction(
  formData: FormData,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const kindRaw = String(formData.get("kind") ?? "");
    const kind =
      kindRaw === "proof_of_funds" || kindRaw === "pre_approval" ? kindRaw : null;
    if (!kind) return fail("validation", "Choose proof of funds or a pre-approval letter.");
    const label = String(formData.get("label") ?? "").trim();
    const file = formData.get("file");
    if (!(file instanceof File)) return fail("validation", "Choose a file.");
    if (file.size > MAX_BYTES) return fail("validation", "File must be 25MB or smaller.");
    const type = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(type) && !file.name.toLowerCase().match(/\.(pdf|png|jpe?g|heic|heif)$/)) {
      return fail("validation", "PDF, PNG, JPEG, or HEIC only.");
    }
    const dealId = await ensureBuyerPrepDealId(actor);
    const id = crypto.randomUUID();
    const filename = safeFilename(file.name);
    const path = `buyer/${actor.userId}/${id}/${filename}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = type.startsWith("image/") || type === "application/pdf" ? type : "application/pdf";
    const { error: upErr } = await actor.admin.storage.from("deal-documents").upload(path, buffer, {
      contentType,
      upsert: false,
    });
    if (upErr) throw new DealActionError("validation", upErr.message);
    const { error } = await actor.admin.from("documents").insert({
      id,
      deal_id: dealId,
      uploader_id: actor.userId,
      name:
        label ||
        (kind === "proof_of_funds" ? "Proof of funds" : "Pre-approval letter"),
      kind,
      storage_path: path,
      status: "Pending",
      visibility: "buyer_side",
    });
    if (error) throw new DealActionError("validation", error.message);
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function getDocumentUrlAction(
  documentId: string,
  purpose: "preview" | "download" = "preview",
): Promise<ActionResult<{ url: string; name: string }>> {
  try {
    const actor = await requireActor();
    const { data: doc } = await actor.admin.from("documents").select("*").eq("id", documentId).maybeSingle();
    if (!doc || doc.status === "deleted") throw new DealActionError("not_found", "Document not found.");
    if (!doc.deal_id) {
      if (doc.uploader_id !== actor.userId && !isStaff(actor)) {
        throw new DealActionError("forbidden", "You cannot access this document.");
      }
    } else {
      const parties = await loadParties(actor.admin, requireDocDealId(doc.deal_id));
      if (!canAccessDocument(actor, parties, asVisibility(doc.visibility))) {
        await insertEvent(actor.admin, requireDocDealId(doc.deal_id), actor.userId, "document.denied", {
          document_id: doc.id,
          purpose,
        });
        throw new DealActionError("forbidden", "You cannot access this document.");
      }
    }
    if (!doc.storage_path || doc.storage_path.startsWith("seed:")) {
      throw new DealActionError("not_found", "No file is stored for this document.");
    }
    const { data, error } = await actor.admin.storage
      .from("deal-documents")
      .createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) {
      throw new DealActionError("forbidden", error?.message ?? "Could not mint a signed URL.");
    }
    if (doc.deal_id) {
      await insertEvent(
        actor.admin,
        doc.deal_id,
        actor.userId,
        purpose === "download" ? "document.downloaded" : "document.viewed",
        { document_id: doc.id },
      );
    }
    return { ok: true, data: { url: data.signedUrl, name: doc.name } };
  } catch (error) {
    return wrapError(error);
  }
}

export async function deleteDocumentAction(documentId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { doc, parties } = await loadDocument(actor, documentId);
    if (doc.uploader_id !== actor.userId && !isSupervisor(actor, parties)) {
      throw new DealActionError("forbidden", "Only the uploader or a broker may delete this file.");
    }
    await actor.admin.from("documents").update({ status: "deleted" }).eq("id", doc.id);
    await insertEvent(actor.admin, requireDocDealId(doc.deal_id), actor.userId, "document.deleted", {
      document_id: doc.id,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

async function listingContext(actor: Actor, dealId: string) {
  const { data: deal } = await actor.admin.from("deals").select("*").eq("id", dealId).single();
  if (!deal) throw new DealActionError("not_found", "Deal not found.");
  const { data: listing } = await actor.admin.from("listings").select("*").eq("id", deal.listing_id).single();
  if (!listing) throw new DealActionError("not_found", "Listing not found.");
  const { data: property } = await actor.admin.from("properties").select("*").eq("id", listing.property_id).single();
  if (!property) throw new DealActionError("not_found", "Property not found.");
  return { deal, listing, property };
}

export async function generateDealPacketAction(dealId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { deal, parties } = await resolveDealForActor(actor, dealId);
    const ctx = await listingContext(actor, deal.id);
    const seller = parties.find((p) => p.role === "seller");
    const { data: sellerProfile } = seller
      ? await actor.admin.from("profiles").select("*").eq("id", seller.user_id).maybeSingle()
      : { data: null };
    const sellerName = sellerProfile?.full_name || actor.profile.full_name || "Seller";
    const address = [
      ctx.property.address_line,
      ctx.property.borough,
      ctx.property.city,
      ctx.property.state,
      ctx.property.zip,
    ]
      .filter(Boolean)
      .join(", ");
    const today = new Date().toISOString().slice(0, 10);
    const identity = await loadBrokerageIdentity(actor.admin);
    try {
      assertRenderableBrokerageIdentity(identity);
    } catch (err) {
      throw new DealActionError(
        "validation",
        err instanceof Error ? err.message : "Brokerage identity is not configured.",
      );
    }

    const docs: { name: string; kind: string; visibility: DocumentVisibility; pdf: Uint8Array }[] = [
      {
        name: "Listing agreement",
        kind: "Listing",
        visibility: "seller_side",
        pdf: await renderTemplatePdf(
          listingAgreementTemplate({
            sellerName,
            address,
            bbl: ctx.property.bbl,
            block: ctx.property.block,
            lot: ctx.property.lot,
            date: today,
            exclusiveExpiresOn: exclusiveExpiresOn(today, identity.listingTermDays),
            protectionDays: identity.protectionDays,
            buyerAgentOffered: Boolean(ctx.listing.buyer_agent_offered),
            brokerageName: identity.legalName,
            licenseNumber: identity.licenseNumber,
            brokerOfRecordName: identity.brokerOfRecordName,
            brokerOfRecordLicense: identity.brokerOfRecordLicense,
          }),
        ),
      },
      {
        name: "NY Agency Disclosure acknowledgment",
        kind: "Disclosures",
        visibility: "seller_side",
        pdf: await renderTemplatePdf(
          agencyDisclosureTemplate({
            partyName: sellerName,
            address,
            date: today,
            brokerageName: identity.legalName,
          }),
        ),
      },
      {
        name: "Property Condition Disclosure Statement",
        kind: "Disclosures",
        visibility: "shared",
        pdf: await renderTemplatePdf(
          propertyConditionTemplate({ sellerName, address, date: today, electCredit: false }),
        ),
      },
      {
        name: "Seller letter of intent (non-binding)",
        kind: "Listing",
        visibility: "seller_side",
        pdf: await renderTemplatePdf(sellerLoiTemplate({ sellerName, address, date: today })),
      },
    ];
    const yearBuilt = ctx.property.year_built ?? 0;
    if (yearBuilt && yearBuilt < 1978) {
      docs.push({
        name: "Lead-based paint disclosure",
        kind: "Disclosures",
        visibility: "shared",
        pdf: await renderTemplatePdf(leadPaintTemplate({ sellerName, address, yearBuilt, date: today })),
      });
    }

    for (const item of docs) {
      const { data: existing } = await actor.admin
        .from("documents")
        .select("id")
        .eq("deal_id", deal.id)
        .eq("name", item.name)
        .neq("status", "deleted")
        .maybeSingle();
      if (existing) continue;
      await storePdf({
        actor,
        dealId: deal.id,
        name: item.name,
        kind: item.kind,
        visibility: item.visibility,
        pdf: item.pdf,
      });
    }
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

type SignSessionResult = {
  mode: "native";
  /** Always null for native — open SignatureCapture in-page. */
  signUrl: string | null;
  documentId: string;
  clientId: string | null;
  environment: "test" | "live" | "unavailable";
  openForRole: "seller" | "brokerage";
  signerName: string;
};

function parsePngDataUrl(dataUrl: string): Uint8Array {
  const match = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim());
  if (!match?.[1]) {
    throw new DealActionError("validation", "Signature image must be a PNG data URL.");
  }
  return Buffer.from(match[1], "base64");
}

async function requestClientMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || h.get("x-real-ip") || null;
    const userAgent = h.get("user-agent");
    return { ip, userAgent };
  } catch {
    return { ip: null, userAgent: null };
  }
}

async function prepareNativeListingSession(
  actor: Actor,
  doc: Tables<"documents">,
  openForRole: "seller" | "brokerage",
): Promise<SignSessionResult> {
  const identity = await loadBrokerageIdentity(actor.admin);
  assertRenderableBrokerageIdentity(identity);
  const dealId = requireDocDealId(doc.deal_id);
  const sellerName = actor.profile.full_name || "Seller";
  const session = await createEmbeddedSigningSession({
    title: doc.name,
    subject: `Sign: ${doc.name}`,
    message: "Review and sign this listing agreement.",
    openForRole,
    signers: [
      { name: sellerName, email: actor.email, role: "seller", order: 0 },
      {
        name: identity.brokerOfRecordName,
        email: "broker@platform.local",
        role: "brokerage",
        order: 1,
      },
    ],
    pdf: new Uint8Array(),
    filename: `${safeFilename(doc.name)}.pdf`,
    metadata: {
      document_id: doc.id,
      deal_id: dealId,
      doc_kind: "listing_agreement",
    },
  });
  const extracted = mergeEsignMeta(doc.extracted, {
    provider: "native",
    environment: session.environment,
    delivery: "native",
    signaturesByRole: session.signaturesByRole,
    sellerName: readEsignMeta(doc.extracted)?.sellerName ?? sellerName,
    brokerageName: identity.brokerOfRecordName,
  });
  await actor.admin
    .from("documents")
    .update({
      signature_request_id: session.signatureRequestId,
      extracted,
    })
    .eq("id", doc.id);
  await insertEvent(actor.admin, dealId, actor.userId, "signature.session_opened", {
    document_id: doc.id,
    signature_request_id: session.signatureRequestId,
    role: openForRole,
    provider: "native",
    notify: false,
  });
  return {
    mode: "native",
    signUrl: null,
    documentId: doc.id,
    clientId: null,
    environment: session.environment,
    openForRole,
    signerName:
      openForRole === "brokerage"
        ? identity.brokerOfRecordName
        : actor.profile.full_name || "Seller",
  };
}

export async function startSignatureAction(
  documentId: string,
): Promise<ActionResult<SignSessionResult>> {
  try {
    const actor = await requireActor();
    const { doc } = await loadDocument(actor, documentId);
    if (/listing agreement/i.test(doc.name)) {
      return { ok: true, data: await prepareNativeListingSession(actor, doc, "seller") };
    }
    return {
      ok: true,
      data: await prepareNativeListingSession(actor, doc, "seller"),
    };
  } catch (error) {
    return wrapError(error);
  }
}

/** @deprecated Email-link recovery retired for native platform documents. */
export async function emailListingAgreementSigningLinkAction(
  _listingId: string,
): Promise<ActionResult<{ documentId: string; emailed: true }>> {
  return fail(
    "unavailable",
    "Email signing links are not used for platform documents. Resume signing in this page.",
  );
}

/** Broker console: prepare native countersign (open SignatureCapture). */
export async function startListingAgreementCountersignAction(
  documentId: string,
): Promise<ActionResult<SignSessionResult>> {
  try {
    const actor = await requireActor();
    if (!isStaff(actor)) {
      throw new DealActionError("forbidden", "Broker of record only.");
    }
    const { doc } = await loadDocument(actor, documentId);
    if (!/listing agreement/i.test(doc.name)) {
      throw new DealActionError("validation", "Only listing agreements support countersignature.");
    }
    const status = (doc.status ?? "").toLowerCase();
    if (status !== "signed") {
      throw new DealActionError("wrong_state", "Seller signature is required before countersignature.");
    }
    return { ok: true, data: await prepareNativeListingSession(actor, doc, "brokerage") };
  } catch (error) {
    return wrapError(error);
  }
}

/**
 * Execution act: client sends signature PNG only.
 * Server stamps the canonical unsigned PDF, stores evidence, advances status.
 */
export async function executeNativeSignatureAction(input: {
  documentId: string;
  roleKey: "seller" | "brokerage";
  method: NativeCaptureMethod;
  pngDataUrl: string;
}): Promise<
  ActionResult<{
    documentId: string;
    status: string;
    unsignedSha256: string;
    executedSha256: string;
  } & AppSnapshot>
> {
  try {
    const actor = await requireActor();
    const { doc } = await loadDocument(actor, input.documentId);
    if (input.roleKey === "brokerage" && !isStaff(actor)) {
      throw new DealActionError("forbidden", "Broker of record only.");
    }
    if (input.roleKey === "seller" && !isStaff(actor)) {
      const parties = await loadParties(actor.admin, requireDocDealId(doc.deal_id));
      const isSeller = parties.some((p) => p.user_id === actor.userId && p.role === "seller");
      if (!isSeller) {
        throw new DealActionError("forbidden", "Only the seller may sign this block.");
      }
    }

    const status = (doc.status ?? "").toLowerCase();
    if (input.roleKey === "seller" && (status === "signed" || status === "fully executed" || status === "completed")) {
      throw new DealActionError("wrong_state", "This agreement is already signed by the seller.");
    }
    if (input.roleKey === "brokerage" && status !== "signed") {
      throw new DealActionError("wrong_state", "Seller signature is required before countersignature.");
    }

    const meta = readEsignMeta(doc.extracted);
    const blocks = meta?.signatureBlocks;
    if (!blocks?.length) {
      throw new DealActionError("wrong_state", "Signature block coordinates are missing on this document.");
    }
    const unsignedPath = meta?.unsignedStoragePath || doc.storage_path;
    if (!unsignedPath) throw new DealActionError("not_found", "Document has no file.");

    const { data: unsignedFile, error: downErr } = await actor.admin.storage
      .from("deal-documents")
      .download(unsignedPath);
    if (downErr || !unsignedFile) {
      throw new DealActionError("not_found", downErr?.message ?? "Could not read unsigned PDF.");
    }
    const unsignedPdf = new Uint8Array(await unsignedFile.arrayBuffer());
    const pngBytes = parsePngDataUrl(input.pngDataUrl);
    const nowIso = new Date().toISOString();
    const { ip, userAgent } = await requestClientMeta();
    const dealId = requireDocDealId(doc.deal_id);

    // Load prior signature images so we re-stamp from the unsigned original.
    const prior = meta?.signatures ?? {};
    const stamps: Array<{ roleKey: string; pngBytes: Uint8Array; signedAtIso: string }> = [];
    for (const [roleKey, entry] of Object.entries(prior)) {
      if (!entry || roleKey === input.roleKey) continue;
      const { data: img } = await actor.admin.storage
        .from("deal-documents")
        .download(entry.imageStoragePath);
      if (!img) continue;
      stamps.push({
        roleKey,
        pngBytes: new Uint8Array(await img.arrayBuffer()),
        signedAtIso: entry.signedAt,
      });
    }
    stamps.push({ roleKey: input.roleKey, pngBytes, signedAtIso: nowIso });

    const stamped = await stampSignatureOntoPdf({
      unsignedPdf,
      blocks,
      stamps,
    });

    const imagePath = `${dealId}/${doc.id}/evidence/${input.roleKey}-${Date.now()}.png`;
    const executedPath = `${dealId}/${doc.id}/executed-${Date.now()}.pdf`;
    const unsignedRetainPath =
      meta?.unsignedStoragePath ||
      `${dealId}/${doc.id}/unsigned-${safeFilename(doc.name)}.pdf`;

    if (!meta?.unsignedStoragePath) {
      const { error: retainErr } = await actor.admin.storage
        .from("deal-documents")
        .upload(unsignedRetainPath, unsignedPdf, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (retainErr && !/already exists|Duplicate/i.test(retainErr.message)) {
        throw new DealActionError("validation", retainErr.message);
      }
    }

    const { error: imgErr } = await actor.admin.storage
      .from("deal-documents")
      .upload(imagePath, pngBytes, { contentType: "image/png", upsert: false });
    if (imgErr) throw new DealActionError("validation", imgErr.message);

    const { error: execErr } = await actor.admin.storage
      .from("deal-documents")
      .upload(executedPath, stamped.executedPdf, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (execErr) throw new DealActionError("validation", execErr.message);

    const signerName =
      input.roleKey === "brokerage"
        ? (await loadBrokerageIdentity(actor.admin)).brokerOfRecordName
        : actor.profile.full_name || "Seller";

    const evidence: SignatureEvidenceEntry = {
      signerUserId: actor.userId,
      signerName,
      signedAt: nowIso,
      method: input.method,
      imageStoragePath: imagePath,
      unsignedSha256: stamped.unsignedSha256,
      executedSha256: stamped.executedSha256,
      consentVersion: NATIVE_CONSENT_VERSION,
      ip,
      userAgent,
    };

    const nextStatus = input.roleKey === "seller" ? "Signed" : "Fully executed";
    const extracted = mergeEsignMeta(doc.extracted, {
      provider: "native",
      environment: "live",
      delivery: "native",
      unsignedStoragePath: unsignedRetainPath,
      unsignedSha256: stamped.unsignedSha256,
      executedSha256: stamped.executedSha256,
      signatureBlocks: blocks,
      sellerSignedAt: input.roleKey === "seller" ? nowIso : meta?.sellerSignedAt ?? null,
      brokerageSignedAt: input.roleKey === "brokerage" ? nowIso : meta?.brokerageSignedAt ?? null,
      sellerName: input.roleKey === "seller" ? signerName : meta?.sellerName ?? null,
      brokerageName: input.roleKey === "brokerage" ? signerName : meta?.brokerageName ?? null,
      signatures: { [input.roleKey]: evidence },
    });

    await actor.admin
      .from("documents")
      .update({
        status: nextStatus,
        storage_path: executedPath,
        extracted,
        signature_request_id: `native:${doc.id}`,
      })
      .eq("id", doc.id);

    await completeListingAgreementTask(actor.admin, dealId);

    await insertEvent(actor.admin, dealId, actor.userId, "signature.signed", {
      document_id: doc.id,
      role: input.roleKey,
      signer_user_id: actor.userId,
      unsigned_sha256: stamped.unsignedSha256,
      executed_sha256: stamped.executedSha256,
      capture_method: input.method,
      consent_text: NATIVE_CONSENT_TEXT,
      consent_version: NATIVE_CONSENT_VERSION,
      ip,
      user_agent: userAgent,
      signature_image_path: imagePath,
      phase: input.roleKey === "seller" ? "seller_signed" : "fully_executed",
      name: doc.name,
      notify: false,
    });

    if (input.roleKey === "seller") {
      try {
        await insertApprovalRequest(actor.admin, {
          dealId,
          kind: "listing_agreement_countersign",
          requestedBy: actor.userId,
          context: { document_id: doc.id },
        });
      } catch {
        /* migration optional — queue also reads Signed documents */
      }
    }

    if (input.roleKey === "brokerage") {
      const now = new Date().toISOString();
      await actor.admin
        .from("approvals")
        .update({
          status: "approved",
          decided_by: actor.userId,
          decided_at: now,
          note: "Countersigned natively",
        })
        .eq("deal_id", dealId)
        .eq("kind", "listing_agreement_countersign")
        .eq("status", "pending");
      await emailExecutedAgreementCopy(actor.admin, dealId, doc.id);
    }

    const snap = await fresh();
    if (!snap.ok) return snap;
    return {
      ok: true,
      data: {
        ...snap.data,
        documentId: doc.id,
        status: nextStatus,
        unsignedSha256: stamped.unsignedSha256,
        executedSha256: stamped.executedSha256,
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}

/** Data-URL for a stored signature evidence image (side-restricted via document ACL). */
export async function getSignatureEvidenceUrlAction(
  documentId: string,
  roleKey: "seller" | "brokerage",
): Promise<ActionResult<{ url: string }>> {
  try {
    const actor = await requireActor();
    const { doc } = await loadDocument(actor, documentId);
    const meta = readEsignMeta(doc.extracted);
    const path = meta?.signatures?.[roleKey]?.imageStoragePath;
    if (!path) throw new DealActionError("not_found", "No signature evidence for that role.");
    // Return a data URL so the agreement preview never depends on bucket CORS / signed-URL fetch.
    const { data: file, error } = await actor.admin.storage.from("deal-documents").download(path);
    if (error || !file) {
      throw new DealActionError("not_found", error?.message ?? "Could not open evidence.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const b64 = Buffer.from(bytes).toString("base64");
    return { ok: true, data: { url: `data:image/png;base64,${b64}` } };
  } catch (error) {
    return wrapError(error);
  }
}

async function completeListingAgreementTask(admin: Actor["admin"], dealId: string) {
  const now = new Date().toISOString();
  const { data: tasks } = await admin.from("tasks").select("*").eq("deal_id", dealId);
  const agreement = (tasks ?? []).find((t) => /listing agreement/i.test(t.title));
  if (agreement && agreement.status !== "done") {
    await admin.from("tasks").update({ status: "done", completed_at: now }).eq("id", agreement.id);
  }
}

/** @deprecated Use executeNativeSignatureAction — mock signing is retired. */
export async function completeMockSignatureAction(
  _documentId: string,
): Promise<ActionResult<AppSnapshot>> {
  return fail(
    "unavailable",
    "Mock signing is retired. Use the in-page signature capture.",
  );
}

export async function declineSignatureAction(documentId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { doc } = await loadDocument(actor, documentId);
    await actor.admin.from("documents").update({ status: "declined" }).eq("id", doc.id);
    await insertEvent(actor.admin, requireDocDealId(doc.deal_id), actor.userId, "signature.declined", {
      document_id: doc.id,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function resendSignatureAction(documentId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { doc } = await loadDocument(actor, documentId);
    await actor.admin.from("documents").update({ status: "Pending" }).eq("id", doc.id);
    await insertEvent(actor.admin, requireDocDealId(doc.deal_id), actor.userId, "signature.resent", {
      document_id: doc.id,
    });
    const started = await startSignatureAction(documentId);
    if (!started.ok) return started;
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

async function replaceUnsignedListingAgreement(
  actor: Actor,
  dealId: string,
): Promise<Tables<"documents">> {
  const ctx = await listingContext(actor, dealId);
  const parties = await loadParties(actor.admin, dealId);
  const seller = parties.find((p) => p.role === "seller");
  const { data: sellerProfile } = seller
    ? await actor.admin.from("profiles").select("*").eq("id", seller.user_id).maybeSingle()
    : { data: null };
  const sellerName = sellerProfile?.full_name || actor.profile.full_name || "Seller";
  const address = [
    ctx.property.address_line,
    ctx.property.borough,
    ctx.property.city,
    ctx.property.state,
    ctx.property.zip,
  ]
    .filter(Boolean)
    .join(", ");
  const today = new Date().toISOString().slice(0, 10);
  const identity = await loadBrokerageIdentity(actor.admin);
  try {
    assertRenderableBrokerageIdentity(identity);
  } catch (err) {
    throw new DealActionError(
      "validation",
      err instanceof Error ? err.message : "Brokerage identity is not configured.",
    );
  }
  const rendered = await renderTemplatePdfWithBlocks(
    listingAgreementTemplate({
      sellerName,
      address,
      bbl: ctx.property.bbl,
      block: ctx.property.block,
      lot: ctx.property.lot,
      date: today,
      exclusiveExpiresOn: exclusiveExpiresOn(today, identity.listingTermDays),
      protectionDays: identity.protectionDays,
      buyerAgentOffered: Boolean(ctx.listing.buyer_agent_offered),
      brokerageName: identity.legalName,
      licenseNumber: identity.licenseNumber,
      brokerOfRecordName: identity.brokerOfRecordName,
      brokerOfRecordLicense: identity.brokerOfRecordLicense,
    }),
  );

  const { data: existing } = await actor.admin
    .from("documents")
    .select("*")
    .eq("deal_id", dealId)
    .eq("name", "Listing agreement")
    .neq("status", "deleted")
    .maybeSingle();

  if (existing) {
    const status = (existing.status ?? "").toLowerCase();
    if (
      status === "completed" ||
      status === "signed" ||
      status === "fully executed" ||
      status === "fully_executed"
    ) {
      return existing;
    }
    await actor.admin.from("documents").update({ status: "deleted" }).eq("id", existing.id);
  }

  const unsignedSha = sha256Hex(rendered.bytes);
  const doc = await storePdf({
    actor,
    dealId,
    name: "Listing agreement",
    kind: "Listing",
    visibility: "seller_side",
    pdf: rendered.bytes,
    extracted: mergeEsignMeta(null, {
      provider: "native",
      environment: "live",
      delivery: "native",
      signatureBlocks: rendered.signatureBlocks,
      unsignedSha256: unsignedSha,
      sellerName,
      brokerageName: identity.brokerOfRecordName,
    }),
  });
  // Retain unsigned path = initial storage_path until first execution rewrites storage_path.
  await actor.admin
    .from("documents")
    .update({
      extracted: mergeEsignMeta(doc.extracted, {
        provider: "native",
        environment: "live",
        unsignedStoragePath: doc.storage_path,
        signatureBlocks: rendered.signatureBlocks,
        unsignedSha256: unsignedSha,
      }),
    })
    .eq("id", doc.id);
  const { data: refreshed } = await actor.admin
    .from("documents")
    .select("*")
    .eq("id", doc.id)
    .single();
  return refreshed ?? doc;
}

/** Rebuild the listing-agreement PDF from current listing terms (co-broke, identity). */
export async function regenerateListingAgreementAction(
  listingId: string,
): Promise<ActionResult<{ documentId: string } & AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { resolveListingRow } = await import("@/lib/actions/listing");
    const { listing } = await resolveListingRow(actor.admin, listingId);
    const { data: deal } = await actor.admin
      .from("deals")
      .select("*")
      .eq("listing_id", listing.id)
      .maybeSingle();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    const agreement = await replaceUnsignedListingAgreement(actor, deal.id);
    const snap = await fresh();
    if (!snap.ok) return snap;
    return { ok: true, data: { ...snap.data, documentId: agreement.id } };
  } catch (error) {
    return wrapError(error);
  }
}

export async function startListingAgreementAction(
  listingId: string,
): Promise<ActionResult<SignSessionResult>> {
  try {
    const actor = await requireActor();
    const { resolveListingRow } = await import("@/lib/actions/listing");
    const { listing } = await resolveListingRow(actor.admin, listingId);
    const { data: deal } = await actor.admin
      .from("deals")
      .select("*")
      .eq("listing_id", listing.id)
      .maybeSingle();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    // Only build the listing-agreement PDF for signing. Other packet docs are
    // generated in the background so Tap to sign is not blocked on them.
    const agreement = await replaceUnsignedListingAgreement(actor, deal.id);
    void generateDealPacketAction(deal.id).catch(() => {
      /* disclosures / LOI — best-effort; agreement already ready */
    });
    return startSignatureAction(agreement.id);
  } catch (error) {
    return wrapError(error);
  }
}

export async function ensureDualAgencyConsentAction(dealId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { deal, parties } = await resolveDealForActor(actor, dealId);
    const hasSeller = parties.some((p) => p.side === "seller");
    const hasBuyer = parties.some((p) => p.side === "buyer");
    if (!hasSeller || !hasBuyer) return fresh();
    const ctx = await listingContext(actor, deal.id);
    const seller = parties.find((p) => p.role === "seller");
    const buyer = parties.find((p) => p.role === "buyer");
    const { data: sellerP } = seller
      ? await actor.admin.from("profiles").select("full_name").eq("id", seller.user_id).maybeSingle()
      : { data: null };
    const { data: buyerP } = buyer
      ? await actor.admin.from("profiles").select("full_name").eq("id", buyer.user_id).maybeSingle()
      : { data: null };
    const address = ctx.property.address_line;
    const identity = await loadBrokerageIdentity(actor.admin);
    const pdf = await renderTemplatePdf(
      dualAgencyTemplate({
        sellerName: sellerP?.full_name || "Seller",
        buyerName: buyerP?.full_name || "Buyer",
        address,
        date: new Date().toISOString().slice(0, 10),
        brokerageName: identity.legalName,
      }),
    );
    for (const name of ["Designated agency consent — Seller", "Designated agency consent — Buyer"] as const) {
      const { data: existing } = await actor.admin
        .from("documents")
        .select("id")
        .eq("deal_id", deal.id)
        .eq("name", name)
        .neq("status", "deleted")
        .maybeSingle();
      if (existing) continue;
      await storePdf({
        actor,
        dealId: deal.id,
        name,
        kind: "Disclosures",
        visibility: "shared",
        pdf,
      });
    }
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function extractContractAction(documentId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { doc, parties } = await loadDocument(actor, documentId);
    if (!isSupervisor(actor, parties) && !hasRole(parties, actor.userId, ["attorney_seller", "attorney_buyer"])) {
      throw new DealActionError("forbidden", "Only an AE, broker, or attorney may run extraction.");
    }
    if (!extractionAvailable()) {
      return fail("validation", "Contract extraction is unavailable until ANTHROPIC_API_KEY is set.");
    }
    if (!doc.storage_path) throw new DealActionError("not_found", "Document has no file.");
    const { data: file, error } = await actor.admin.storage.from("deal-documents").download(doc.storage_path);
    if (error || !file) throw new DealActionError("not_found", "Could not read the PDF.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const proposed = await extractContractFromPdf(bytes);
    const payload: ExtractedPayload = { status: "proposed", proposed };
    await actor.admin.from("documents").update({ extracted: payload as unknown as Json }).eq("id", doc.id);
    await insertEvent(actor.admin, requireDocDealId(doc.deal_id), actor.userId, "extraction.proposed", {
      document_id: doc.id,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

function deadlineTasks(extracted: ContractExtraction): {
  title: string;
  description: string;
  owner_role: string;
  due_date: string | null;
}[] {
  const rows: { title: string; description: string; owner_role: string; due_date: string | null }[] = [];
  if (extracted.financing.commitmentDeadline) {
    rows.push({
      title: "Mortgage commitment deadline",
      description: "Financing commitment date from the executed contract.",
      owner_role: "buyer",
      due_date: extracted.financing.commitmentDeadline,
    });
  }
  if (extracted.closing.onOrAbout) {
    rows.push({
      title: "Closing target",
      description: extracted.closing.outsideDate
        ? `On or about ${extracted.closing.onOrAbout}; outside date ${extracted.closing.outsideDate}.`
        : `On or about ${extracted.closing.onOrAbout}.`,
      owner_role: "attorney_seller",
      due_date: extracted.closing.onOrAbout,
    });
  }
  for (const item of extracted.contingencies) {
    rows.push({
      title: `${item.name} contingency`,
      description: "Contingency expiration from the executed contract.",
      owner_role: "buyer",
      due_date: item.date,
    });
  }
  return rows;
}

export async function confirmExtractionAction(
  documentId: string,
  confirmed: ContractExtraction,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { doc, parties } = await loadDocument(actor, documentId);
    if (!isSupervisor(actor, parties)) {
      throw new DealActionError("forbidden", "Only an AE or broker may confirm extraction.");
    }
    const now = new Date().toISOString();
    const payload: ExtractedPayload = {
      status: "confirmed",
      proposed:
        doc.extracted && typeof doc.extracted === "object" && !Array.isArray(doc.extracted)
          ? ((doc.extracted as ExtractedPayload).proposed ?? confirmed)
          : confirmed,
      confirmed,
      confirmerId: actor.userId,
      confirmedAt: now,
    };
    await actor.admin.from("documents").update({ extracted: payload as unknown as Json }).eq("id", doc.id);

    const tasks = deadlineTasks(confirmed);
    if (tasks.length) {
      await insertTaskRows(
        actor.admin,
        requireDocDealId(doc.deal_id),
        actor.userId,
        tasks.map((t) => ({
          title: t.title,
          description: t.description,
          owner_role: t.owner_role,
          due_date: t.due_date,
          auto: true,
        })),
      );
    }

    await actor.admin
      .from("deals")
      .update({ contract_document_id: doc.id, updated_at: now })
      .eq("id", requireDocDealId(doc.deal_id));

    const { data: deal } = await actor.admin.from("deals").select("*").eq("id", requireDocDealId(doc.deal_id)).single();
    if (deal?.paused) {
      throw new DealActionError("paused", "This deal is paused by the broker of record.");
    }
    if (deal?.state === "accepted") {
      await actor.admin.from("deals").update({ state: "contract", updated_at: now }).eq("id", deal.id);
    }
    await insertEvent(actor.admin, requireDocDealId(doc.deal_id), actor.userId, "contract.executed", {
      document_id: doc.id,
    });
    await insertEvent(actor.admin, requireDocDealId(doc.deal_id), actor.userId, "extraction.confirmed", {
      document_id: doc.id,
      confirmer_id: actor.userId,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function saveManualDeadlinesAction(
  dealId: string,
  input: { commitmentDeadline?: string; closingTarget?: string; notes?: string },
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { deal, parties } = await resolveDealForActor(actor, dealId);
    if (!isSupervisor(actor, parties)) {
      throw new DealActionError("forbidden", "Only an AE or broker may enter deadlines.");
    }
    const rows = [];
    if (input.commitmentDeadline) {
      rows.push({
        deal_id: deal.id,
        title: "Mortgage commitment deadline",
        description: "Entered manually (extraction unavailable).",
        owner_role: "buyer",
        due_date: input.commitmentDeadline,
        status: "pending" as const,
        auto: true,
      });
    }
    if (input.closingTarget) {
      rows.push({
        deal_id: deal.id,
        title: "Closing target",
        description: input.notes || "Entered manually (extraction unavailable).",
        owner_role: "attorney_seller",
        due_date: input.closingTarget,
        status: "pending" as const,
        auto: true,
      });
    }
    if (rows.length) {
      await insertTaskRows(
        actor.admin,
        deal.id,
        actor.userId,
        rows.map((r) => ({
          title: r.title,
          description: r.description,
          owner_role: r.owner_role,
          due_date: r.due_date,
          auto: true,
        })),
      );
    }
    await insertEvent(actor.admin, deal.id, actor.userId, "deadlines.manual", input);
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function proposeExtractionForTests(
  documentId: string,
  proposed: ContractExtraction,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { doc, parties } = await loadDocument(actor, documentId);
    if (!isSupervisor(actor, parties) && !isStaff(actor)) {
      throw new DealActionError("forbidden", "Only an AE or broker may propose extraction.");
    }
    const payload: ExtractedPayload = { status: "proposed", proposed };
    await actor.admin.from("documents").update({ extracted: payload as unknown as Json }).eq("id", doc.id);
    await insertEvent(actor.admin, requireDocDealId(doc.deal_id), actor.userId, "extraction.proposed", {
      document_id: doc.id,
      test: true,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}
