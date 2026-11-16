import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { EsignEmbeddedSession, EsignEnvironment, EsignSigner } from "@/lib/services/esign";
import type { PdfSignatureBlock } from "@/lib/templates/render-pdf";
import {
  NATIVE_CONSENT_TEXT,
  NATIVE_CONSENT_VERSION,
  type NativeCaptureMethod,
} from "@/lib/services/esign-native-client";

export { NATIVE_CONSENT_TEXT, NATIVE_CONSENT_VERSION, type NativeCaptureMethod };

export type NativeSignatureEvidence = {
  roleKey: string;
  signerUserId: string;
  signerName: string;
  signedAt: string;
  method: NativeCaptureMethod;
  imageStoragePath: string;
  unsignedSha256: string;
  executedSha256: string;
  consentVersion: string;
  ip: string | null;
  userAgent: string | null;
};

export function nativeConfigured(): boolean {
  return true;
}

export function nativeEnvironment(): EsignEnvironment {
  return "live";
}

export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function createNativeSigningSession(input: {
  documentId: string;
  openForRole: string;
  signers: EsignSigner[];
}): Promise<EsignEmbeddedSession> {
  const signaturesByRole: Record<string, string> = {};
  for (const signer of input.signers) {
    signaturesByRole[signer.role.toLowerCase()] = `${input.documentId}:${signer.role.toLowerCase()}`;
  }
  return {
    provider: "native",
    environment: nativeEnvironment(),
    signatureRequestId: `native:${input.documentId}`,
    // Null signUrl means: open SignatureCapture in-page (no vendor iframe).
    signUrl: null,
    signaturesByRole,
    expiresAt: null,
  };
}

export async function stampSignatureOntoPdf(input: {
  unsignedPdf: Uint8Array;
  blocks: PdfSignatureBlock[];
  /** All signatures to apply (re-stamp from unsigned for integrity). */
  stamps: Array<{
    roleKey: string;
    pngBytes: Uint8Array;
    signedAtIso: string;
  }>;
}): Promise<{ executedPdf: Uint8Array; unsignedSha256: string; executedSha256: string }> {
  const unsignedSha256 = sha256Hex(input.unsignedPdf);
  const pdf = await PDFDocument.load(input.unsignedPdf);
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const captionInk = rgb(0.25, 0.28, 0.26);

  for (const stamp of input.stamps) {
    const block = input.blocks.find((b) => b.roleKey === stamp.roleKey);
    if (!block) continue;
    const pages = pdf.getPages();
    const page = pages[block.pageIndex] ?? pages[pages.length - 1];
    if (!page) continue;
    const image = await pdf.embedPng(stamp.pngBytes);
    const maxW = block.width;
    const maxH = block.height;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    const drawX = block.x;
    const drawY = block.y;
    page.drawImage(image, {
      x: drawX,
      y: drawY,
      width: drawW,
      height: drawH,
    });
    const when = formatCaptionDate(stamp.signedAtIso);
    page.drawText(`Signed electronically on ${when}`, {
      x: block.x,
      y: Math.max(24, block.y - 12),
      size: 8,
      font,
      color: captionInk,
    });
  }

  const executedPdf = await pdf.save();
  return {
    executedPdf,
    unsignedSha256,
    executedSha256: sha256Hex(executedPdf),
  };
}

function formatCaptionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
