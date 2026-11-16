import type { FinancingPath } from "@/lib/types";
import type { Json } from "@/lib/database.types";

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function financingPathFromPrefs(
  prefs: Json | null | undefined,
): FinancingPath | null {
  const raw = asRecord(prefs).financingPath;
  return raw === "cash" || raw === "financed" ? raw : null;
}

export function mergeFinancingPathPrefs(
  prefs: Json | null | undefined,
  path: FinancingPath,
): Json {
  return {
    ...asRecord(prefs),
    financingPath: path,
  } as Json;
}
