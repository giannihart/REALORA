import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { insertEvent } from "@/lib/actions/actor";
import { insertApprovalRequest } from "@/lib/actions/approvals";
import {
  listingAgreementFullyExecuted,
  mergeEsignMeta,
  readEsignMeta,
} from "@/lib/documents/esign-meta";
import { downloadSignedPdf, eventAlreadyProcessed, verifyDropboxEvent } from "@/lib/services/esign-dropbox";
import { emailExecutedAgreementCopy } from "@/lib/documents/executed-copy";
import type { Json } from "@/lib/database.types";

export const runtime = "nodejs";

type DropboxSignature = {
  signature_id?: string;
  signer_email_address?: string;
  signer_name?: string;
  signer_role?: string;
  status_code?: string;
  signed_at?: number | null;
  order?: number | null;
};

type DropboxEvent = {
  event?: {
    event_type?: string;
    event_time?: string;
    event_hash?: string;
    event_id?: string;
  };
  signature_request?: {
    signature_request_id?: string;
    metadata?: Record<string, string>;
    is_complete?: boolean;
    signatures?: DropboxSignature[];
  };
};

function isListingAgreementDoc(name: string, meta: Record<string, string> | undefined): boolean {
  if (/listing agreement/i.test(name)) return true;
  return meta?.doc_kind === "listing_agreement";
}

async function replaceVaultPdf(
  admin: ReturnType<typeof createServiceRoleClient>,
  storagePath: string,
  requestId: string,
) {
  try {
    const pdf = await downloadSignedPdf(requestId);
    await admin.storage.from("deal-documents").upload(storagePath, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
  } catch {
    // Signed file download is best-effort; status still advances.
  }
}

async function markAgreementTaskDone(
  admin: ReturnType<typeof createServiceRoleClient>,
  dealId: string,
) {
  const now = new Date().toISOString();
  const { data: tasks } = await admin.from("tasks").select("*").eq("deal_id", dealId);
  const agreement = (tasks ?? []).find((t) => /listing agreement/i.test(t.title));
  if (agreement && agreement.status !== "done") {
    await admin.from("tasks").update({ status: "done", completed_at: now }).eq("id", agreement.id);
  }
}

async function queueCountersignApproval(
  admin: ReturnType<typeof createServiceRoleClient>,
  dealId: string,
  documentId: string,
  requestedBy: string | null,
) {
  try {
    await insertApprovalRequest(admin, {
      dealId,
      kind: "listing_agreement_countersign",
      requestedBy,
      context: { document_id: documentId },
    });
  } catch (err) {
    // Migration 0011 may not be applied yet — document status Signed is the source of truth;
    // the broker approvals queue also surfaces those documents directly.
    console.error("countersign approval queue skipped", err);
  }
}

async function approveCountersignIfOpen(
  admin: ReturnType<typeof createServiceRoleClient>,
  dealId: string,
  documentId: string,
) {
  const now = new Date().toISOString();
  const { data: open, error } = await admin
    .from("approvals")
    .select("*")
    .eq("deal_id", dealId)
    .eq("kind", "listing_agreement_countersign")
    .eq("status", "pending")
    .maybeSingle();
  if (error || !open) return;
  await admin
    .from("approvals")
    .update({
      status: "approved",
      decided_at: now,
      note: "Countersigned via Dropbox Sign",
      context: {
        ...(typeof open.context === "object" && open.context && !Array.isArray(open.context)
          ? open.context
          : {}),
        document_id: documentId,
      },
    })
    .eq("id", open.id);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const raw = form.get("json");
  if (typeof raw !== "string") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const body = JSON.parse(raw) as DropboxEvent;
  const event = body.event ?? {};
  const eventType = event.event_type ?? "";
  const eventTime = event.event_time ?? "";
  const eventHash = event.event_hash ?? "";
  const eventId = event.event_id ?? `${eventTime}:${eventType}:${body.signature_request?.signature_request_id ?? ""}`;

  if (!verifyDropboxEvent(eventTime, eventType, eventHash)) {
    return NextResponse.json({ ok: false, error: "invalid hash" }, { status: 401 });
  }
  if (await eventAlreadyProcessed(eventId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const admin = createServiceRoleClient();
  const requestId = body.signature_request?.signature_request_id;
  const meta = body.signature_request?.metadata ?? {};
  const metaId = meta.document_id;
  let doc = null;
  if (metaId) {
    const { data } = await admin.from("documents").select("*").eq("id", metaId).maybeSingle();
    doc = data;
  }
  if (!doc && requestId) {
    const { data } = await admin
      .from("documents")
      .select("*")
      .eq("signature_request_id", requestId)
      .maybeSingle();
    doc = data;
  }
  if (!doc) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const listingAgreement = isListingAgreementDoc(doc.name, meta);
  const current = (doc.status ?? "").toLowerCase();
  const locked = current === "deleted" || listingAgreementFullyExecuted(doc.status);
  const signatures = body.signature_request?.signatures ?? [];
  const esignPrev = readEsignMeta(doc.extracted);
  const nowIso = new Date().toISOString();

  const signedRows = signatures.filter(
    (s) => s.status_code === "signed" || (typeof s.signed_at === "number" && s.signed_at > 0),
  );
  const sellerSig =
    signedRows.find((s) => (s.signer_role ?? "").toLowerCase() === "seller") ??
    signedRows.find((s) => (s.order ?? 0) === 0) ??
    signedRows[0];
  const brokerageSig =
    signedRows.find((s) => (s.signer_role ?? "").toLowerCase() === "brokerage") ??
    signedRows.find((s) => (s.order ?? 0) === 1);

  const allComplete =
    eventType.includes("all_signed") ||
    eventType.includes("complete") ||
    body.signature_request?.is_complete === true ||
    (listingAgreement && Boolean(sellerSig) && Boolean(brokerageSig));

  const sellerJustSigned =
    listingAgreement &&
    !locked &&
    Boolean(sellerSig) &&
    (eventType.includes("signed") || allComplete) &&
    !listingAgreementFullyExecuted(doc.status);

  if (listingAgreement && allComplete && !locked) {
    if (requestId && doc.storage_path) {
      await replaceVaultPdf(admin, doc.storage_path, requestId);
    }
    const extracted = mergeEsignMeta(doc.extracted, {
      provider: "dropbox",
      environment: esignPrev?.environment ?? (meta.esign_environment === "live" ? "live" : "test"),
      sellerSignedAt: esignPrev?.sellerSignedAt ?? nowIso,
      brokerageSignedAt: nowIso,
      sellerName: sellerSig?.signer_name ?? esignPrev?.sellerName ?? null,
      brokerageName: brokerageSig?.signer_name ?? esignPrev?.brokerageName ?? null,
    });
    await admin
      .from("documents")
      .update({ status: "Fully executed", extracted })
      .eq("id", doc.id);
    if (doc.deal_id) {
      await markAgreementTaskDone(admin, doc.deal_id);
      await approveCountersignIfOpen(admin, doc.deal_id, doc.id);
      await insertEvent(admin, doc.deal_id, null, "signature.signed", {
        document_id: doc.id,
        signature_request_id: requestId ?? null,
        phase: "fully_executed",
        name: doc.name,
        notify: false,
      });
      await emailExecutedAgreementCopy(admin, doc.deal_id, doc.id);
    }
  } else if (sellerJustSigned && !allComplete) {
    if (requestId && doc.storage_path) {
      await replaceVaultPdf(admin, doc.storage_path, requestId);
    }
    const extracted = mergeEsignMeta(doc.extracted, {
      provider: "dropbox",
      environment: esignPrev?.environment ?? (meta.esign_environment === "live" ? "live" : "test"),
      sellerSignedAt: nowIso,
      sellerName: sellerSig?.signer_name ?? esignPrev?.sellerName ?? null,
      brokerageName: esignPrev?.brokerageName ?? null,
    });
    await admin.from("documents").update({ status: "Signed", extracted }).eq("id", doc.id);
    if (doc.deal_id) {
      await markAgreementTaskDone(admin, doc.deal_id);
      await queueCountersignApproval(admin, doc.deal_id, doc.id, null);
      await insertEvent(admin, doc.deal_id, null, "signature.signed", {
        document_id: doc.id,
        signature_request_id: requestId ?? null,
        phase: "seller_signed",
        name: doc.name,
        notify: false,
      });
    }
  } else if (!listingAgreement && !locked) {
    let nextStatus: string | null = null;
    if (eventType.includes("declined")) nextStatus = "declined";
    else if (eventType.includes("expired")) nextStatus = "expired";
    else if (eventType.includes("complete") || eventType.includes("all_signed")) nextStatus = "completed";
    else if (eventType.includes("signed")) nextStatus = "signed";
    else if (eventType.includes("view")) nextStatus = "viewed";
    if (nextStatus) {
      await admin.from("documents").update({ status: nextStatus }).eq("id", doc.id);
    }
    if (nextStatus === "completed" && requestId && doc.storage_path) {
      await replaceVaultPdf(admin, doc.storage_path, requestId);
    }
  } else if (eventType.includes("declined") && !locked) {
    await admin.from("documents").update({ status: "declined" }).eq("id", doc.id);
  } else if (eventType.includes("expired") && !locked) {
    await admin.from("documents").update({ status: "expired" }).eq("id", doc.id);
  }

  if (doc.deal_id) {
    await insertEvent(admin, doc.deal_id, null, "dropbox.event", {
      event_id: eventId,
      event_type: eventType,
      document_id: doc.id,
      signature_request_id: requestId ?? null,
      notify: false,
    } as Json as unknown as Record<string, unknown>);
  }

  return NextResponse.json({ ok: true });
}
