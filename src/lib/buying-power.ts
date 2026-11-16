/**
 * Buying Power — standard 28/36 lender guidelines, labeled as such.
 * Not a loan offer, credit decision, or approval. This calculator never
 * touches credit. A lender's later pre-approval may involve a hard inquiry.
 *
 * Computation (standard guidance):
 *   G  = annual household income / 12
 *   front-end cap   = 28% of G
 *   back-end cap    = 36% of G − monthly debts
 *   housing budget  = min(front-end, back-end)   // max PITI
 *   Reserve estimated taxes (1.1% of price / 12) and insurance
 *   (defaultInsuranceAnnual / 12) from that budget.
 *   Remaining dollars are principal & interest. Max loan comes from the
 *   amortization inverse: P = M · ((1+r)^n − 1) / (r (1+r)^n)
 *   at the illustrative rate and term the visitor edits.
 *   max home price  = max loan + down payment saved
 *   implied down %  = down payment / max home price
 *
 * Worked example ($400,000 income, $1,500/mo debts, $800,000 down, 7.0%/30yr):
 *   G = 400000 / 12 = 33,333.33
 *   28% of G = 9,333.33
 *   36% of G − 1,500 = 12,000 − 1,500 = 10,500
 *   housing budget = min(9,333.33, 10,500) = 9,333.33
 *   Iterate price so P&I + T&I = 9,333.33 (T = 1.1%/12 of price,
 *   I = defaultInsuranceAnnual(price)/12). Converges at
 *   max home price $1,896,478, max loan $1,096,478, target monthly ≈ $9,333,
 *   implied down ≈ 42%.
 *
 * Credit band is stored for the buyer and their lender; it does not change
 * this estimate (no credit check).
 */

import { ILLUSTRATIVE_30_YEAR_RATE } from "@/data/rates-snapshot";
import { defaultInsuranceAnnual, monthlyPayment } from "@/lib/finance";

export const CREDIT_BANDS = [
  { id: "excellent", label: "Excellent 780+" },
  { id: "good", label: "Good 740–779" },
  { id: "fair", label: "Fair 700–739" },
  { id: "building", label: "Building <700" },
] as const;

export type CreditBandId = (typeof CREDIT_BANDS)[number]["id"];

export interface BuyingPowerInputs {
  annualIncome: number;
  monthlyDebts: number;
  downPayment: number;
  creditBand: CreditBandId;
  annualRatePct: number;
  termYears: 15 | 30;
}

export interface BuyingPowerProfile extends BuyingPowerInputs {
  updatedAt: string;
}

export interface BuyingPowerResult {
  grossMonthlyIncome: number;
  frontEndCap: number;
  backEndCap: number;
  housingBudget: number;
  monthlyTaxes: number;
  monthlyInsurance: number;
  principalAndInterest: number;
  maxLoan: number;
  maxHomePrice: number;
  targetMonthlyPayment: number;
  impliedDownPct: number;
}

export const BUYING_POWER_DEFAULTS: BuyingPowerInputs = {
  annualIncome: 400_000,
  monthlyDebts: 1_500,
  downPayment: 800_000,
  creditBand: "good",
  annualRatePct: ILLUSTRATIVE_30_YEAR_RATE,
  termYears: 30,
};

export const PAGE_PAYMENT_DEFAULTS = {
  downPaymentPct: 20,
  annualRatePct: ILLUSTRATIVE_30_YEAR_RATE,
  termYears: 30 as const,
};

const FRONT_END_RATIO = 0.28;
const BACK_END_RATIO = 0.36;
const TAX_RATE_PCT = 1.1;

export function loanFromPayment(
  monthlyPI: number,
  annualRatePct: number,
  termYears: number,
): number {
  if (monthlyPI <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return monthlyPI * n;
  const factor = Math.pow(1 + r, n);
  return (monthlyPI * (factor - 1)) / (r * factor);
}

function monthlyTaxesOn(price: number): number {
  return (Math.max(0, price) * (TAX_RATE_PCT / 100)) / 12;
}

function monthlyInsuranceOn(price: number): number {
  return defaultInsuranceAnnual(Math.max(0, price)) / 12;
}

export function computeBuyingPower(inputs: BuyingPowerInputs): BuyingPowerResult {
  const income = Math.max(0, inputs.annualIncome);
  const debts = Math.max(0, inputs.monthlyDebts);
  const down = Math.max(0, inputs.downPayment);
  const grossMonthlyIncome = income / 12;
  const frontEndCap = FRONT_END_RATIO * grossMonthlyIncome;
  const backEndCap = BACK_END_RATIO * grossMonthlyIncome - debts;
  const housingBudget = Math.max(0, Math.min(frontEndCap, backEndCap));

  let price = down;
  if (housingBudget > 0) {
    const k = monthlyPayment(1, inputs.annualRatePct, inputs.termYears);
    price = down + (k > 0 ? housingBudget / k : 0);
    for (let i = 0; i < 24; i += 1) {
      const ti = monthlyTaxesOn(price) + monthlyInsuranceOn(price);
      const pi = housingBudget - ti;
      const loan = loanFromPayment(pi, inputs.annualRatePct, inputs.termYears);
      const next = Math.max(down, down + Math.max(0, loan));
      if (Math.abs(next - price) < 1) {
        price = next;
        break;
      }
      price = next;
    }
  }

  const maxHomePrice = Math.round(price);
  const maxLoan = Math.max(0, maxHomePrice - down);
  const principalAndInterest = monthlyPayment(
    maxLoan,
    inputs.annualRatePct,
    inputs.termYears,
  );
  const monthlyTaxes = monthlyTaxesOn(maxHomePrice);
  const monthlyInsurance = monthlyInsuranceOn(maxHomePrice);
  const targetMonthlyPayment = principalAndInterest + monthlyTaxes + monthlyInsurance;
  const impliedDownPct = maxHomePrice > 0 ? (Math.min(down, maxHomePrice) / maxHomePrice) * 100 : 100;

  return {
    grossMonthlyIncome,
    frontEndCap,
    backEndCap,
    housingBudget,
    monthlyTaxes,
    monthlyInsurance,
    principalAndInterest,
    maxLoan,
    maxHomePrice,
    targetMonthlyPayment,
    impliedDownPct,
  };
}

export function listingMonthlyPayment(
  price: number,
  profile: BuyingPowerInputs | null,
  annualTaxes?: number,
): number {
  const rate = profile?.annualRatePct ?? PAGE_PAYMENT_DEFAULTS.annualRatePct;
  const term = profile?.termYears ?? PAGE_PAYMENT_DEFAULTS.termYears;
  const down = profile
    ? Math.min(Math.max(0, profile.downPayment), price)
    : price * (PAGE_PAYMENT_DEFAULTS.downPaymentPct / 100);
  const loan = Math.max(0, price - down);
  const pi = monthlyPayment(loan, rate, term);
  const taxes = annualTaxes != null ? annualTaxes / 12 : monthlyTaxesOn(price);
  const insurance = monthlyInsuranceOn(price);
  return pi + taxes + insurance;
}

export function withinBuyingPower(
  price: number,
  profile: BuyingPowerInputs | null,
): boolean {
  if (!profile) return false;
  return price <= computeBuyingPower(profile).maxHomePrice;
}
