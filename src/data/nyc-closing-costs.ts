/**
 * Planning table for New York City buyer closing costs.
 * Not a quote. Attorneys and lenders provide exact figures.
 */

export const CLOSING_COSTS_FOOTNOTE =
  "Planning estimates — your attorney and lender provide exact figures before you commit.";

/** NYS/NYC mansion tax brackets (purchase price). */
export const MANSION_TAX_BRACKETS: { min: number; max: number | null; ratePct: number }[] = [
  { min: 0, max: 999_999.99, ratePct: 0 },
  { min: 1_000_000, max: 1_999_999.99, ratePct: 1 },
  { min: 2_000_000, max: 2_999_999.99, ratePct: 1.25 },
  { min: 3_000_000, max: 4_999_999.99, ratePct: 1.5 },
  { min: 5_000_000, max: 9_999_999.99, ratePct: 2.25 },
  { min: 10_000_000, max: 14_999_999.99, ratePct: 2.5 },
  { min: 15_000_000, max: 19_999_999.99, ratePct: 2.75 },
  { min: 20_000_000, max: 24_999_999.99, ratePct: 3 },
  { min: 25_000_000, max: null, ratePct: 3.9 },
];

/** NYC mortgage recording tax on the loan (residential 1–3 family / condo / co-op typical). */
export const NYC_MORTGAGE_RECORDING_TAX = {
  under500kPct: 1.8,
  atOrAbove500kPct: 1.925,
  threshold: 500_000,
} as const;

/** Title + lender fee planning amounts (orientation only). */
export const TITLE_LENDER_FEES = {
  sample: true as const,
  lenderFees: 2_500,
  attorney: 3_500,
  titleBase: 1_200,
  titlePerMillion: 4_000,
} as const;

export function mansionTaxRate(price: number): number {
  const bracket = [...MANSION_TAX_BRACKETS].reverse().find((b) => price >= b.min);
  return bracket?.ratePct ?? 0;
}

export function mansionTax(price: number): number {
  return price * (mansionTaxRate(price) / 100);
}

export function mortgageRecordingTax(loanAmount: number): number {
  if (loanAmount <= 0) return 0;
  const pct =
    loanAmount < NYC_MORTGAGE_RECORDING_TAX.threshold
      ? NYC_MORTGAGE_RECORDING_TAX.under500kPct
      : NYC_MORTGAGE_RECORDING_TAX.atOrAbove500kPct;
  return loanAmount * (pct / 100);
}

export function titleAndLenderFees(price: number): {
  title: number;
  lenderFees: number;
  attorney: number;
} {
  const millions = Math.max(0, price) / 1_000_000;
  return {
    title: Math.round(TITLE_LENDER_FEES.titleBase + millions * TITLE_LENDER_FEES.titlePerMillion),
    lenderFees: TITLE_LENDER_FEES.lenderFees,
    attorney: TITLE_LENDER_FEES.attorney,
  };
}

export interface ClosingCostLine {
  id: string;
  label: string;
  amount: number;
}

export function estimateBuyerClosingCosts(price: number, loanAmount: number): {
  lines: ClosingCostLine[];
  total: number;
} {
  const mansion = mansionTax(price);
  const recording = mortgageRecordingTax(loanAmount);
  const fees = titleAndLenderFees(price);
  const lines: ClosingCostLine[] = [
    {
      id: "mansion",
      label: `Mansion tax (${mansionTaxRate(price)}%)`,
      amount: Math.round(mansion),
    },
    {
      id: "recording",
      label:
        loanAmount >= NYC_MORTGAGE_RECORDING_TAX.threshold
          ? "NYC mortgage recording tax (≈1.925%)"
          : "NYC mortgage recording tax (≈1.8%)",
      amount: Math.round(recording),
    },
    { id: "title", label: "Title estimate", amount: fees.title },
    { id: "lender", label: "Lender fees estimate", amount: fees.lenderFees },
    { id: "attorney", label: "Buyer attorney estimate", amount: fees.attorney },
  ];
  return { lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
}
