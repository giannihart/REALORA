import "server-only";
import {
  createDropboxEmbeddedRequest,
  createDropboxEmailRequest,
  dropboxConfigured,
  dropboxEnvironment,
  getDropboxEmbeddedSignUrl,
} from "@/lib/services/esign-dropbox";
import {
  createNativeSigningSession,
  nativeConfigured,
  nativeEnvironment,
} from "@/lib/services/esign-native";

/** Provider-agnostic e-sign surface used by intake + broker console. */
export type EsignEnvironment = "test" | "live" | "unavailable";

export type EsignProvider = "native" | "dropbox";

export type EsignSigner = {
  name: string;
  email: string;
  /** Matches signer roles (e.g. seller, brokerage). */
  role: string;
  order?: number;
};

/**
 * Session shape returned to callers. Native: signUrl is null — open SignatureCapture.
 * Dropbox (unselected for platform docs): signUrl is the embedded iframe URL.
 */
export type EsignEmbeddedSession = {
  provider: EsignProvider;
  environment: EsignEnvironment;
  signatureRequestId: string;
  /** Embedded sign URL when provider hosts the iframe; null for native capture. */
  signUrl: string | null;
  /** All signature ids by role for later countersign / recovery. */
  signaturesByRole: Record<string, string>;
  expiresAt: number | null;
};

export type EsignEmailRequest = {
  provider: "dropbox";
  environment: EsignEnvironment;
  signatureRequestId: string;
  signaturesByRole: Record<string, string>;
};

/** Platform documents always use native — no vendor keys required. */
export function esignConfigured(): boolean {
  return nativeConfigured();
}

export function esignEnvironment(): EsignEnvironment {
  return nativeEnvironment();
}

export function esignProviderForPlatformDocuments(): EsignProvider {
  return "native";
}

/**
 * Opens (or creates) an in-page signing session.
 * Platform docs → native (SignatureCapture). Dropbox remains available but unselected.
 */
export async function createEmbeddedSigningSession(input: {
  title: string;
  subject: string;
  message: string;
  signers: EsignSigner[];
  openForRole: string;
  pdf: Uint8Array;
  filename: string;
  metadata: Record<string, string>;
  /** Force Dropbox (kept for non-platform / future); default native. */
  provider?: EsignProvider;
}): Promise<EsignEmbeddedSession> {
  const provider = input.provider ?? esignProviderForPlatformDocuments();
  if (provider === "native") {
    const documentId = input.metadata.document_id || crypto.randomUUID();
    return createNativeSigningSession({
      documentId,
      openForRole: input.openForRole,
      signers: input.signers,
    });
  }
  if (!dropboxConfigured()) {
    throw new Error("Dropbox Sign is not configured.");
  }
  return createDropboxEmbeddedRequest(input);
}

/** Resume a Dropbox embedded session (unused for native platform docs). */
export async function resumeEmbeddedSigningSession(signatureId: string): Promise<{
  signUrl: string | null;
  expiresAt: number | null;
}> {
  if (!dropboxConfigured()) {
    throw new Error("Dropbox Sign is not configured.");
  }
  return getDropboxEmbeddedSignUrl(signatureId);
}

/**
 * Dropbox email-link recovery — retired for native platform documents.
 * Kept behind the interface; callers for listing agreements must not use it.
 */
export async function createEmailSigningRequest(input: {
  title: string;
  subject: string;
  message: string;
  signers: EsignSigner[];
  pdf: Uint8Array;
  filename: string;
  metadata: Record<string, string>;
}): Promise<EsignEmailRequest> {
  if (!dropboxConfigured()) {
    throw new Error("Dropbox Sign is not configured.");
  }
  return createDropboxEmailRequest(input);
}

export { dropboxConfigured, dropboxEnvironment };
