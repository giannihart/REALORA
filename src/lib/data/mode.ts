export type DataMode = "local" | "supabase" | "production";

export function getDataMode(): DataMode {
  const value = process.env.NEXT_PUBLIC_DATA_MODE;
  if (value === "local") return "local";
  if (value === "production") return "production";
  // Default and deployed configuration is the live engine.
  return "supabase";
}

export function isLocalDataMode(): boolean {
  return getDataMode() === "local";
}

/** Postgres-backed modes (supabase + production). */
export function isSupabaseDataMode(): boolean {
  const mode = getDataMode();
  return mode === "supabase" || mode === "production";
}

export function isLiveDataMode(): boolean {
  return isSupabaseDataMode();
}

export function isProductionDataMode(): boolean {
  return getDataMode() === "production";
}

/** Mock vendor fallbacks are allowed outside production only. */
export function mocksAllowed(): boolean {
  return !isProductionDataMode();
}
