import type { CertaintyLabel, OfferDraft } from "@/lib/types";

export interface ScoreResult {
  score: number;
  label: CertaintyLabel;
  note: string;
}

function daysUntil(iso: string, from = new Date().toISOString().slice(0, 10)): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${iso}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Clamp raw score into an estimated win likelihood sellers would weigh. */
export function likelihoodPercent(score: number): number {
  return Math.min(95, Math.max(8, Math.round(score)));
}

export function scoreOffer(draft: OfferDraft): ScoreResult {
  let score = 40;
  if (draft.financing === "Cash") score += 28;
  else if (draft.financing === "Conventional") score += 12;
  else score += 4;

  if (!draft.inspectionContingency) score += 8;
  if (!draft.financingContingency) score += 10;
  if (draft.verifiedFunds) score += 10;

  const emdPct = draft.price > 0 ? draft.emd / draft.price : 0;
  score += Math.min(12, emdPct * 100);

  const closeDays = daysUntil(draft.closeDate);
  if (closeDays <= 21) score += 12;
  else if (closeDays <= 35) score += 7;
  else if (closeDays <= 50) score += 3;
  else score -= 6;

  if (draft.downPercent >= 100) score += 6;
  else if (draft.downPercent >= 30) score += 3;

  const cashFast =
    draft.financing === "Cash" &&
    closeDays <= 30 &&
    (!draft.inspectionContingency || !draft.financingContingency);

  const jumboSlowHigh =
    draft.financing === "Jumbo" && closeDays > 45;

  let label: CertaintyLabel = "Competitive";
  let note =
    "Balanced price with standard contingencies.";

  if (cashFast) {
    label = "Strongest certainty";
    note =
      "Highest certainty — cash, short close, fewest contingencies.";
  } else if (jumboSlowHigh) {
    label = "Highest price";
    note =
      "Highest price is not the strongest offer — more risk and delays.";
  } else if (score >= 85) {
    label = "Strongest certainty";
    note = "Strongest certainty";
  } else if (draft.financing !== "Cash" && draft.price > 0) {
    label = "Competitive";
    note = "Balanced price with standard contingencies.";
  }

  return { score: Math.round(score), label, note };
}

export function netToSeller(
  price: number,
  concessions: number,
  buyerAgentPercent: number,
): { fee: number; buyerAgent: number; net: number } {
  const fee = Math.round(price * 0.01);
  const buyerAgent = Math.round(price * (buyerAgentPercent / 100));
  const net = price - fee - buyerAgent - concessions;
  return { fee, buyerAgent, net };
}
