import { FAIR_HOUSING_BANNED_TERMS } from "@/lib/config/fair-housing-terms";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function lintFairHousing(text: string): string[] {
  const hits: string[] = [];
  for (const term of FAIR_HOUSING_BANNED_TERMS) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
    if (pattern.test(text)) hits.push(term);
  }
  return hits;
}
