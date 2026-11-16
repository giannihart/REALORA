"use server";

import { requireActor } from "@/lib/actions/actor";
import { fail, wrapError, type ActionResult } from "@/lib/actions/errors";
import {
  CREDIT_BANDS,
  type BuyingPowerInputs,
  type BuyingPowerProfile,
  type CreditBandId,
} from "@/lib/buying-power";

const BANDS = new Set<string>(CREDIT_BANDS.map((b) => b.id));

function asDollars(cents: number): number {
  return Math.round(cents) / 100;
}

function asCents(dollars: number): number {
  return Math.round(Math.max(0, dollars) * 100);
}

function parseBand(value: string): CreditBandId | null {
  return BANDS.has(value) ? (value as CreditBandId) : null;
}

function fromRow(row: {
  annual_income_cents: number;
  monthly_debts_cents: number;
  down_payment_cents: number;
  credit_band: string;
  rate_pct: number;
  term_years: number;
  updated_at: string;
}): BuyingPowerProfile | null {
  const creditBand = parseBand(row.credit_band);
  if (!creditBand) return null;
  const termYears = row.term_years === 15 ? 15 : row.term_years === 30 ? 30 : null;
  if (!termYears) return null;
  return {
    annualIncome: asDollars(row.annual_income_cents),
    monthlyDebts: asDollars(row.monthly_debts_cents),
    downPayment: asDollars(row.down_payment_cents),
    creditBand,
    annualRatePct: Number(row.rate_pct),
    termYears,
    updatedAt: row.updated_at,
  };
}

export async function getBuyingPowerAction(): Promise<ActionResult<BuyingPowerProfile | null>> {
  try {
    const actor = await requireActor();
    const { data, error } = await actor.admin
      .from("buying_power_profiles")
      .select("*")
      .eq("user_id", actor.userId)
      .maybeSingle();
    // Missing table (migration not applied) — treat as no profile, don't block Home.
    if (error) {
      if (/schema cache|does not exist|Could not find the table/i.test(error.message)) {
        return { ok: true, data: null };
      }
      return fail("validation", error.message);
    }
    if (!data) return { ok: true, data: null };
    return { ok: true, data: fromRow(data) };
  } catch (error) {
    const wrapped = wrapError(error);
    if (!wrapped.ok && wrapped.code === "unauthenticated") return { ok: true, data: null };
    return wrapped;
  }
}

export async function saveBuyingPowerAction(
  inputs: BuyingPowerInputs,
): Promise<ActionResult<BuyingPowerProfile>> {
  try {
    const actor = await requireActor();
    if (!BANDS.has(inputs.creditBand)) {
      return fail("validation", "Choose a credit band.");
    }
    const termYears = inputs.termYears === 15 ? 15 : 30;
    const ratePct = Number(inputs.annualRatePct);
    if (!Number.isFinite(ratePct) || ratePct <= 0 || ratePct >= 30) {
      return fail("validation", "Enter an illustrative rate.");
    }
    const now = new Date().toISOString();
    const { data, error } = await actor.admin
      .from("buying_power_profiles")
      .upsert(
        {
          user_id: actor.userId,
          annual_income_cents: asCents(inputs.annualIncome),
          monthly_debts_cents: asCents(inputs.monthlyDebts),
          down_payment_cents: asCents(inputs.downPayment),
          credit_band: inputs.creditBand,
          rate_pct: ratePct,
          term_years: termYears,
          updated_at: now,
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();
    if (error || !data) {
      if (error && /schema cache|does not exist|Could not find the table/i.test(error.message)) {
        return {
          ok: true,
          data: { ...inputs, updatedAt: now },
        };
      }
      return fail("validation", error?.message ?? "Could not save Buying Power.");
    }
    const profile = fromRow(data);
    if (!profile) return fail("validation", "Could not save Buying Power.");
    return { ok: true, data: profile };
  } catch (error) {
    return wrapError(error);
  }
}
