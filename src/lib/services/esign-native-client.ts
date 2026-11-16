/** Client-safe native e-sign constants (no Node/pdf-lib). */

export const NATIVE_CONSENT_TEXT =
  "I understand this is a legal representation of my signature.";
export const NATIVE_CONSENT_VERSION = "v1";

export type NativeCaptureMethod = "draw" | "type" | "upload";
