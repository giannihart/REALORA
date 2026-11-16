import type { AcrisStepState, ManualPropertyFields } from "@/components/sell/AcrisSummaryStep";

export const SELL_INTAKE_HANDOFF_KEY = "realora.sellIntake.v1";

export type SellIntakeHandoff = {
  v: 1;
  street: string;
  unit: string;
  neighborhood: string;
  city: string;
  borough: string;
  acris: AcrisStepState;
  showManual: boolean;
  manual: ManualPropertyFields;
  mediaDate: string;
  mediaTime: string | null;
  price: number | null;
  plusOne: boolean;
  step: number;
};

export function saveSellIntakeHandoff(payload: SellIntakeHandoff): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SELL_INTAKE_HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — intake may need re-entry */
  }
}

export function loadSellIntakeHandoff(): SellIntakeHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SELL_INTAKE_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SellIntakeHandoff;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSellIntakeHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SELL_INTAKE_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

/** Bridges Dropbox "sign" → portal before the webhook refreshes document status. */
export const INTAKE_JUST_SIGNED_KEY = "realora.intake.justSigned";

export function markIntakeJustSigned(listingId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(INTAKE_JUST_SIGNED_KEY, listingId);
  } catch {
    /* ignore */
  }
}

export function readIntakeJustSigned(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(INTAKE_JUST_SIGNED_KEY);
  } catch {
    return null;
  }
}

export function clearIntakeJustSigned(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(INTAKE_JUST_SIGNED_KEY);
  } catch {
    /* ignore */
  }
}

export function sellAuthNext(extra?: { price?: number | null; plusOne?: boolean }): string {
  const params = new URLSearchParams();
  params.set("resume", "1");
  if (extra?.price != null && Number.isFinite(extra.price)) {
    params.set("price", String(extra.price));
  }
  if (extra?.plusOne) params.set("plusOne", "1");
  return `/sell?${params.toString()}`;
}
