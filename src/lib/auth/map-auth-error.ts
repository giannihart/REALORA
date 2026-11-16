const WRONG_CREDS =
  "That email and password don't match. Check them and try again.";
const RATE_LIMITED = "Too many attempts — wait a minute and try again.";
const DUPLICATE = "An account with that email already exists — sign in instead";
const SMTP_UNCONFIGURED =
  "Email sending isn't configured on this project yet. Password reset can't go out until SMTP is set up.";

export function mapSignInError(message: string | undefined | null): string {
  const m = (message ?? "").toLowerCase();
  if (
    m.includes("rate") ||
    m.includes("too many") ||
    m.includes("429") ||
    m.includes("over_request")
  ) {
    return RATE_LIMITED;
  }
  if (
    m.includes("invalid login") ||
    m.includes("invalid credentials") ||
    m.includes("wrong password") ||
    m.includes("user not found") ||
    m.includes("email not confirmed") ||
    m.includes("invalid_credentials")
  ) {
    return WRONG_CREDS;
  }
  return WRONG_CREDS;
}

export function mapSignUpError(message: string | undefined | null): string {
  const m = (message ?? "").toLowerCase();
  if (
    m.includes("rate") ||
    m.includes("too many") ||
    m.includes("429") ||
    m.includes("over_request")
  ) {
    return RATE_LIMITED;
  }
  if (
    m.includes("already") ||
    m.includes("registered") ||
    m.includes("exists") ||
    m.includes("duplicate") ||
    m.includes("unique")
  ) {
    return DUPLICATE;
  }
  if (m.includes("password") && (m.includes("least") || m.includes("short") || m.includes("weak"))) {
    return "Use at least 8 characters for your password.";
  }
  return "Couldn't create that account. Check your details and try again.";
}

export function mapResetError(message: string | undefined | null): string {
  const m = (message ?? "").toLowerCase();
  if (
    m.includes("rate") ||
    m.includes("too many") ||
    m.includes("429")
  ) {
    return RATE_LIMITED;
  }
  if (
    m.includes("smtp") ||
    m.includes("email") ||
    m.includes("mail") ||
    m.includes("sending") ||
    m.includes("not configured") ||
    m.includes("error sending") ||
    m.includes("unable to send")
  ) {
    return SMTP_UNCONFIGURED;
  }
  return SMTP_UNCONFIGURED;
}

export const AUTH_COPY = {
  wrongCreds: WRONG_CREDS,
  rateLimited: RATE_LIMITED,
  duplicate: DUPLICATE,
  smtpUnconfigured: SMTP_UNCONFIGURED,
} as const;
