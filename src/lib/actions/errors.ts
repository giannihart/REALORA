export type ActionErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "wrong_state"
  | "validation"
  | "not_found"
  | "tier_too_low"
  | "paused"
  | "disclosure_required"
  | "designated_agency_required"
  | "fair_housing"
  | "unavailable";

export class DealActionError extends Error {
  readonly code: ActionErrorCode;
  constructor(code: ActionErrorCode, message: string) {
    super(message);
    this.name = "DealActionError";
    this.code = code;
  }
}

export class ActionFailure extends Error {
  readonly code: ActionErrorCode;
  constructor(code: ActionErrorCode, message: string) {
    super(message);
    this.name = "ActionFailure";
    this.code = code;
  }
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string };

export function fail(code: ActionErrorCode, message: string): ActionResult<never> {
  return { ok: false, code, message };
}

export function wrapError(error: unknown): ActionResult<never> {
  if (error instanceof DealActionError) {
    return { ok: false, code: error.code, message: error.message };
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return { ok: false, code: "validation", message };
}
