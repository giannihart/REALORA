import type { Json } from "@/lib/database.types";
import type { EsignEnvironment, EsignProvider } from "@/lib/services/esign";
import type { NativeCaptureMethod } from "@/lib/services/esign-native";
import type { PdfSignatureBlock } from "@/lib/templates/render-pdf";

export type SignatureEvidenceEntry = {
  signerUserId: string;
  signerName: string;
  signedAt: string;
  method: NativeCaptureMethod;
  imageStoragePath: string;
  unsignedSha256: string;
  executedSha256: string;
  consentVersion: string;
  ip?: string | null;
  userAgent?: string | null;
};

/** Stored on documents.extracted.esign — never rendered as marketing chrome. */
export type DocumentEsignMeta = {
  provider: EsignProvider;
  environment: EsignEnvironment;
  delivery?: "embedded" | "email" | "native";
  signaturesByRole?: Record<string, string>;
  signatureBlocks?: PdfSignatureBlock[];
  unsignedStoragePath?: string | null;
  unsignedSha256?: string | null;
  executedSha256?: string | null;
  sellerSignedAt?: string | null;
  brokerageSignedAt?: string | null;
  sellerName?: string | null;
  brokerageName?: string | null;
  /** Per-role evidence used to re-render signature boxes. */
  signatures?: Partial<Record<string, SignatureEvidenceEntry>>;
};

export function asRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asEvidenceEntry(raw: unknown): SignatureEvidenceEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.signerUserId !== "string" || typeof row.signedAt !== "string") return null;
  if (typeof row.imageStoragePath !== "string") return null;
  const method =
    row.method === "draw" || row.method === "type" || row.method === "upload" ? row.method : "draw";
  return {
    signerUserId: row.signerUserId,
    signerName: typeof row.signerName === "string" ? row.signerName : "",
    signedAt: row.signedAt,
    method,
    imageStoragePath: row.imageStoragePath,
    unsignedSha256: typeof row.unsignedSha256 === "string" ? row.unsignedSha256 : "",
    executedSha256: typeof row.executedSha256 === "string" ? row.executedSha256 : "",
    consentVersion: typeof row.consentVersion === "string" ? row.consentVersion : "v1",
    ip: typeof row.ip === "string" ? row.ip : null,
    userAgent: typeof row.userAgent === "string" ? row.userAgent : null,
  };
}

export function readEsignMeta(extracted: Json | null | undefined): DocumentEsignMeta | null {
  const root = asRecord(extracted);
  const raw = root.esign;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.provider !== "dropbox" && row.provider !== "native") return null;
  const environment =
    row.environment === "live" || row.environment === "test" || row.environment === "unavailable"
      ? row.environment
      : "live";
  const signaturesByRole =
    row.signaturesByRole && typeof row.signaturesByRole === "object" && !Array.isArray(row.signaturesByRole)
      ? (row.signaturesByRole as Record<string, string>)
      : undefined;
  const signatureBlocks = Array.isArray(row.signatureBlocks)
    ? (row.signatureBlocks as PdfSignatureBlock[])
    : undefined;
  const signaturesRaw =
    row.signatures && typeof row.signatures === "object" && !Array.isArray(row.signatures)
      ? (row.signatures as Record<string, unknown>)
      : {};
  const signatures: DocumentEsignMeta["signatures"] = {};
  for (const [key, value] of Object.entries(signaturesRaw)) {
    const entry = asEvidenceEntry(value);
    if (entry) signatures[key] = entry;
  }
  return {
    provider: row.provider,
    environment,
    delivery:
      row.delivery === "email" || row.delivery === "embedded" || row.delivery === "native"
        ? row.delivery
        : undefined,
    signaturesByRole,
    signatureBlocks,
    unsignedStoragePath: typeof row.unsignedStoragePath === "string" ? row.unsignedStoragePath : null,
    unsignedSha256: typeof row.unsignedSha256 === "string" ? row.unsignedSha256 : null,
    executedSha256: typeof row.executedSha256 === "string" ? row.executedSha256 : null,
    sellerSignedAt: typeof row.sellerSignedAt === "string" ? row.sellerSignedAt : null,
    brokerageSignedAt: typeof row.brokerageSignedAt === "string" ? row.brokerageSignedAt : null,
    sellerName: typeof row.sellerName === "string" ? row.sellerName : null,
    brokerageName: typeof row.brokerageName === "string" ? row.brokerageName : null,
    signatures,
  };
}

export function mergeEsignMeta(
  extracted: Json | null | undefined,
  patch: Partial<DocumentEsignMeta> & Pick<DocumentEsignMeta, "provider" | "environment">,
): Json {
  const root = asRecord(extracted);
  const prev = readEsignMeta(extracted) ?? {
    provider: patch.provider,
    environment: patch.environment,
  };
  return {
    ...root,
    esign: {
      ...prev,
      ...patch,
      signaturesByRole: {
        ...(prev.signaturesByRole ?? {}),
        ...(patch.signaturesByRole ?? {}),
      },
      signatures: {
        ...(prev.signatures ?? {}),
        ...(patch.signatures ?? {}),
      },
      signatureBlocks: patch.signatureBlocks ?? prev.signatureBlocks,
    },
  } as Json;
}

export function listingAgreementSellerSigned(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return (
    s === "signed" ||
    s === "fully executed" ||
    s === "completed" ||
    s === "fully_executed"
  );
}

export function listingAgreementFullyExecuted(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "fully executed" || s === "completed" || s === "fully_executed";
}

/** Display label for signature boxes — sourced from the document record only. */
export function formatSignedStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
