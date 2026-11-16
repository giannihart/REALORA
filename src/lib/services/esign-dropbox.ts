import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import * as DropboxSign from "@dropbox/sign";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type {
  EsignEmbeddedSession,
  EsignEmailRequest,
  EsignEnvironment,
  EsignSigner,
} from "@/lib/services/esign";

export type SignMode = "dropbox" | "mock";

export function getSignMode(): SignMode {
  return process.env.DROPBOX_SIGN_API_KEY ? "dropbox" : "mock";
}

export function dropboxConfigured(): boolean {
  return Boolean(process.env.DROPBOX_SIGN_API_KEY && process.env.DROPBOX_SIGN_CLIENT_ID);
}

/** Test mode is the default until DROPBOX_SIGN_TEST_MODE=false. */
export function dropboxEnvironment(): EsignEnvironment {
  if (!dropboxConfigured()) return "unavailable";
  return process.env.DROPBOX_SIGN_TEST_MODE === "false" ? "live" : "test";
}

function apis() {
  const key = process.env.DROPBOX_SIGN_API_KEY;
  if (!key) throw new Error("DROPBOX_SIGN_API_KEY is not set.");
  const sig = new DropboxSign.SignatureRequestApi();
  sig.username = key;
  const embedded = new DropboxSign.EmbeddedApi();
  embedded.username = key;
  return { sig, embedded };
}

/**
 * Dropbox non-template requests use 1-based signerN text tags, not named roles.
 * Map response signatures back onto the roles we passed in order.
 */
function mapSignaturesByRole(
  signatures: Array<{ signatureId?: string | null; signerRole?: string | null; order?: number | null }> | undefined,
  rolesInOrder: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const rows = [...(signatures ?? [])];
  rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  rows.forEach((row, i) => {
    const id = row.signatureId;
    if (!id) return;
    const fromRole = row.signerRole?.toLowerCase();
    const role = (fromRole && rolesInOrder.includes(fromRole) ? fromRole : rolesInOrder[i]) ?? `signer_${i}`;
    out[role.toLowerCase()] = id;
  });
  return out;
}

function toApiSigners(signers: EsignSigner[]) {
  return signers.map((s, i) => ({
    emailAddress: s.email,
    name: s.name,
    order: s.order ?? i,
  }));
}

export async function getDropboxEmbeddedSignUrl(signatureId: string): Promise<{
  signUrl: string | null;
  expiresAt: number | null;
}> {
  const { embedded } = apis();
  const urlRes = await embedded.embeddedSignUrl(signatureId);
  return {
    signUrl: urlRes.body.embedded?.signUrl ?? null,
    expiresAt: urlRes.body.embedded?.expiresAt ?? null,
  };
}

export async function createDropboxEmbeddedRequest(input: {
  title: string;
  subject: string;
  message: string;
  signers: EsignSigner[];
  openForRole: string;
  pdf: Uint8Array;
  filename: string;
  metadata: Record<string, string>;
}): Promise<EsignEmbeddedSession> {
  const clientId = process.env.DROPBOX_SIGN_CLIENT_ID;
  if (!clientId) throw new Error("DROPBOX_SIGN_CLIENT_ID is not set.");
  const { sig, embedded } = apis();
  const env = dropboxEnvironment();
  const request = new DropboxSign.SignatureRequestCreateEmbeddedRequest();
  request.clientId = clientId;
  request.title = input.title;
  request.subject = input.subject;
  request.message = input.message;
  request.testMode = env !== "live";
  request.metadata = {
    ...input.metadata,
    esign_provider: "dropbox",
    esign_environment: env,
  };
  request.useTextTags = true;
  request.hideTextTags = true;
  request.signers = toApiSigners(input.signers);
  request.files = [
    {
      value: Buffer.from(input.pdf),
      options: { filename: input.filename, contentType: "application/pdf" },
    },
  ];

  const created = await sig.signatureRequestCreateEmbedded(request);
  const body = created.body.signatureRequest;
  const signatureRequestId = body?.signatureRequestId ?? "";
  const roles = input.signers.map((s) => s.role.toLowerCase());
  const signaturesByRole = mapSignaturesByRole(body?.signatures, roles);
  const openId = signaturesByRole[input.openForRole.toLowerCase()];
  let signUrl: string | null = null;
  let expiresAt: number | null = null;
  if (openId) {
    const urlRes = await embedded.embeddedSignUrl(openId);
    signUrl = urlRes.body.embedded?.signUrl ?? null;
    expiresAt = urlRes.body.embedded?.expiresAt ?? null;
  }
  return {
    provider: "dropbox",
    environment: env,
    signatureRequestId,
    signUrl,
    signaturesByRole,
    expiresAt,
  };
}

export async function createDropboxEmailRequest(input: {
  title: string;
  subject: string;
  message: string;
  signers: EsignSigner[];
  pdf: Uint8Array;
  filename: string;
  metadata: Record<string, string>;
}): Promise<EsignEmailRequest> {
  const { sig } = apis();
  const env = dropboxEnvironment();
  const request = new DropboxSign.SignatureRequestSendRequest();
  request.title = input.title;
  request.subject = input.subject;
  request.message = input.message;
  request.testMode = env !== "live";
  request.metadata = {
    ...input.metadata,
    esign_provider: "dropbox",
    esign_environment: env,
    delivery: "email",
  };
  request.useTextTags = true;
  request.hideTextTags = true;
  request.signers = toApiSigners(input.signers);
  request.files = [
    {
      value: Buffer.from(input.pdf),
      options: { filename: input.filename, contentType: "application/pdf" },
    },
  ];
  const created = await sig.signatureRequestSend(request);
  const body = created.body.signatureRequest;
  const roles = input.signers.map((s) => s.role.toLowerCase());
  return {
    provider: "dropbox",
    environment: env,
    signatureRequestId: body?.signatureRequestId ?? "",
    signaturesByRole: mapSignaturesByRole(body?.signatures, roles),
  };
}

/** @deprecated Prefer createDropboxEmbeddedRequest via the esign interface. */
export async function createEmbeddedSignatureRequest(input: {
  title: string;
  subject: string;
  message: string;
  signers: { name: string; email: string; role?: string }[];
  pdf: Uint8Array;
  filename: string;
  metadata: Record<string, string>;
}): Promise<{ signatureRequestId: string; signUrl: string | null; expiresAt: number | null }> {
  const session = await createDropboxEmbeddedRequest({
    ...input,
    openForRole: input.signers[0]?.role || "seller",
    signers: input.signers.map((s, i) => ({
      name: s.name,
      email: s.email,
      role: s.role || (i === 0 ? "seller" : "brokerage"),
      order: i,
    })),
  });
  return {
    signatureRequestId: session.signatureRequestId,
    signUrl: session.signUrl,
    expiresAt: session.expiresAt,
  };
}

export async function downloadSignedPdf(signatureRequestId: string): Promise<Buffer> {
  const { sig } = apis();
  const res = await sig.signatureRequestFiles(signatureRequestId, "pdf");
  const data = res.body as unknown;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  throw new Error("Could not download signed PDF.");
}

export function verifyDropboxEvent(eventTime: string, eventType: string, eventHash: string): boolean {
  const key = process.env.DROPBOX_SIGN_API_KEY;
  if (!key) return false;
  const digest = createHmac("sha256", key).update(eventTime + eventType).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(eventHash));
  } catch {
    return false;
  }
}

export async function eventAlreadyProcessed(eventId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("events")
    .select("id")
    .eq("type", "dropbox.event")
    .contains("payload", { event_id: eventId })
    .limit(1);
  return (data ?? []).length > 0;
}
