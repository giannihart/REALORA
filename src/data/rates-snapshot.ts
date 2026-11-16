/**
 * National average rates for orientation / planning only.
 * Not a quote. Not personalized. Not "today's rates."
 */

export const RATES_DISCLAIMER =
  "National averages for orientation — not a quote. Your lender quotes your rate.";

export type RateProductId =
  | "30-year-fixed"
  | "15-year-fixed"
  | "jumbo"
  | "fha"
  | "va";

export interface RateProduct {
  id: RateProductId;
  name: string;
  /** National average for orientation, percent. */
  ratePct: number;
  asOf: string;
  minDownPct: number;
  whoFor: string;
}

export const RATES_SNAPSHOT = {
  sample: true as const,
  asOf: "October 30, 2026",
  disclaimer: RATES_DISCLAIMER,
  products: [
    {
      id: "30-year-fixed",
      name: "30-Year Fixed",
      ratePct: 6.32,
      asOf: "October 30, 2026",
      minDownPct: 5,
      whoFor: "The default. Payment never changes.",
    },
    {
      id: "15-year-fixed",
      name: "15-Year Fixed",
      ratePct: 5.61,
      asOf: "October 30, 2026",
      minDownPct: 5,
      whoFor: "Higher payment, far less interest, faster equity.",
    },
    {
      id: "jumbo",
      name: "Jumbo",
      ratePct: 6.55,
      asOf: "October 30, 2026",
      minDownPct: 20,
      whoFor:
        "For loans above the conforming limit — most homes on this platform. Expect fuller documentation and reserves.",
    },
    {
      id: "fha",
      name: "FHA",
      ratePct: 6.18,
      asOf: "October 30, 2026",
      minDownPct: 3.5,
      whoFor:
        "3.5% down and friendlier credit — rarely the winner at New York prices, but a real first rung.",
    },
    {
      id: "va",
      name: "VA",
      ratePct: 6.05,
      asOf: "October 30, 2026",
      minDownPct: 0,
      whoFor: "For eligible veterans: 0% down, no mortgage insurance.",
    },
  ] satisfies RateProduct[],
} as const;

export const ILLUSTRATIVE_30_YEAR_RATE = RATES_SNAPSHOT.products[0].ratePct;

export function rateProduct(id: RateProductId): RateProduct {
  const hit = RATES_SNAPSHOT.products.find((p) => p.id === id);
  if (!hit) throw new Error(`Unknown rate product: ${id}`);
  return hit;
}
