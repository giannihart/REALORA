import type { Json } from "@/lib/database.types";

export function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/[.,'"/\\()-]/g, " ")
    .replace(/\b(INC|LLC|LP|LLP|CORP|CORPORATION|TRUST|ESTATE|THE)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(profileName: string, owners: string[]): boolean {
  const needle = normalizeName(profileName);
  if (!needle) return false;
  const needleTokens = needle.split(" ").filter((t) => t.length > 1);
  return owners.some((owner) => {
    const hay = normalizeName(owner);
    if (!hay) return false;
    if (hay === needle) return true;
    if (hay.includes(needle) || needle.includes(hay)) return true;
    const hayTokens = hay.split(" ").filter((t) => t.length > 1);
    if (!needleTokens.length || !hayTokens.length) return false;
    const overlap = needleTokens.filter((t) => hayTokens.includes(t));
    return overlap.length >= Math.min(2, needleTokens.length);
  });
}

export function ownersFromAcris(payload: Json | null): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const rec = payload as Record<string, unknown>;
  if (Array.isArray(rec.ownersOfRecord)) {
    return rec.ownersOfRecord.filter((n): n is string => typeof n === "string");
  }
  return [];
}
