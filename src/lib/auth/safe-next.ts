/** Relative in-app paths only. Rejects protocol-relative and absolute URLs. */
export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://")) return fallback;
  return trimmed;
}

export function isSellerPortalPath(path: string): boolean {
  return path === "/portal/seller" || path.startsWith("/portal/seller/");
}

export function portalHomeForIntent(
  intent: string | null | undefined,
  roleHint?: "buyer" | "seller",
): string {
  // New sellers (and buyers entering the seller portal) start on the sell flow.
  if (intent === "selling" || roleHint === "seller") return "/sell";
  if (intent === "buying" || intent === "offer" || roleHint === "buyer") return "/portal/buyer";
  return "/portal";
}

/** Auth redirect after sign-in/up. Seller portal entry points become /sell. */
export function resolveAuthDestination(
  nextRaw: string | null | undefined,
  intent: string | null | undefined,
  roleHint?: "buyer" | "seller",
): string {
  const fallback = portalHomeForIntent(intent, roleHint);
  const dest = safeNextPath(nextRaw, fallback);
  if (isSellerPortalPath(dest)) return "/sell";
  return dest;
}
