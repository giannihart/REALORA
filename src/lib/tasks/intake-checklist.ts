/**
 * Intake prep is driven by Documents + next-step CTAs, not a Mark-done list.
 * These legacy titles are hidden from seller My assignments.
 */
export const RETIRED_SELLER_CHECKLIST_TITLES = [
  /^confirm public record$/i,
  /^schedule photography$/i,
  /^sign listing agreement$/i,
  /^set asking price and copy$/i,
  /^upload listing photos$/i,
  /^permit research/i,
];

export function isRetiredSellerChecklistTitle(title: string): boolean {
  return RETIRED_SELLER_CHECKLIST_TITLES.some((re) => re.test(title.trim()));
}
