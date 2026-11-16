import type { Listing } from "@/lib/types";

export function scoreListingForDescription(listing: Listing, description: string): number {
  const q = description.trim().toLowerCase();
  if (!q) return 0;

  const haystack = [
    listing.title,
    ...listing.about,
    listing.neighborhood,
    listing.city,
    listing.type,
    listing.address,
    listing.heating,
    listing.badge ?? "",
    ...listing.stagingLabels,
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  const tokens = q
    .split(/[^a-z0-9+]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  for (const token of tokens) {
    if (haystack.includes(token)) score += 2;
  }

  const concepts: [RegExp | string, (p: Listing) => boolean, number][] = [
    ["garden", () => /garden|terrace|yard|outdoor/i.test(haystack), 6],
    ["roof", () => /roof|deck|terrace/i.test(haystack), 5],
    ["fireplace", () => /fireplace/i.test(haystack), 5],
    ["loft", (p) => p.type === "Loft" || /loft|cast-iron|gallery/i.test(haystack), 8],
    ["townhouse", (p) => p.type === "Townhouse" || /townhouse|brownstone/i.test(haystack), 8],
    ["brownstone", () => /brownstone|townhouse/i.test(haystack), 8],
    ["condo", (p) => p.type === "Condo", 6],
    ["doorman", () => /doorman|concierge/i.test(haystack), 5],
    ["elevator", () => /elevator/i.test(haystack), 4],
    ["waterfront", () => /water|river|harbor|promenade|bay/i.test(haystack), 6],
    ["family", (p) => p.beds >= 3 || /family|suite|nursery/i.test(haystack), 4],
    ["modern", () => /modern|new|rebuilt|renovat|chef/i.test(haystack), 3],
    ["historic", () => /historic|landmarked|19th|original|restored/i.test(haystack), 5],
    ["quiet", () => /tree-lined|quiet|residential|family neighborhood/i.test(haystack), 4],
    ["walkable", () => /walkable|shops|restaurant|park/i.test(haystack), 3],
    ["office", () => /office|media room|work/i.test(haystack), 4],
    ["kitchen", () => /kitchen|chef|island/i.test(haystack), 3],
    ["light", () => /light|windows|sunny|oversized/i.test(haystack), 3],
    ["west village", () => /west village/i.test(haystack), 10],
    ["soho", () => /soho/i.test(haystack), 10],
    ["brooklyn", () => /brooklyn|heights|dumbo|park slope|williamsburg/i.test(haystack), 8],
    ["pacific heights", () => /pacific heights/i.test(haystack), 10],
    ["bedroom", () => true, 0],
  ];

  for (const [key, test, pts] of concepts) {
    const present =
      typeof key === "string" ? q.includes(key) : (key as RegExp).test(q);
    if (present && test(listing)) score += pts;
  }

  const bedMatch = q.match(/(\d+)\s*(?:bed|br|bedroom)/);
  if (bedMatch) {
    const n = Number(bedMatch[1]);
    if (listing.beds >= n) score += 5;
    else score -= 3;
  }

  if (/under\s*\$?\s*3|budget|affordable/i.test(q) && listing.price < 3_000_000) score += 4;
  if (/luxury|trophy|\$\s*10|ten million/i.test(q) && listing.price >= 8_000_000) score += 5;

  return score;
}

export function rankByDescription(listings: Listing[], description: string): Listing[] {
  const q = description.trim();
  if (!q) return listings;

  return [...listings]
    .map((p) => ({ p, score: scoreListingForDescription(p, q) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ p }) => p);
}
