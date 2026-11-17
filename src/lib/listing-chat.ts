import { lintFairHousing } from "@/lib/compliance/fair-housing";
import { defaultInsuranceAnnual, estimatePayment } from "@/lib/finance";
import { formatNumber, formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/types";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

const FAIR_HOUSING_REPLY =
  "I can only talk about this listing's published facts — price, rooms, size, taxes, year built, heating, and the copy on this page. I don't answer questions about schools, crime, or who should live here.";

const OFF_TOPIC_REPLY =
  "I only know this listing. Ask about the price, rooms, taxes, year built, heating, outdoor space, or what's in the description.";

const STEERING =
  /\b(good schools?|school district|school quality|crime rate|is it safe|safe neighborhood|dangerous area|for (kids|children|families|couples|singles)|family-friendly|who should live|demographics?)\b/i;

function daysOnMarket(listing: Listing): number | null {
  const at = listing.createdAt ?? listing.syndication.find((s) => s.at)?.at;
  if (!at) return null;
  const day = at.slice(0, 10);
  const a = new Date(`${day}T00:00:00`).getTime();
  if (Number.isNaN(a)) return null;
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function statusLabel(listing: Listing) {
  if (listing.status === "in_contract") return "pending";
  if (listing.status === "closed") return "sold";
  return "for sale";
}

function hoaMonthly(listing: Listing) {
  if (listing.type === "Condo" || listing.type === "Loft") {
    return Math.round(listing.sqft * 0.85);
  }
  return 0;
}

function bathsLabel(baths: number) {
  return `${baths} bath${baths === 1 ? "" : "s"}`;
}

function pricePerSqft(listing: Listing) {
  if (listing.sqft <= 0) return null;
  return Math.round(listing.price / listing.sqft);
}

export function listingFactPack(listing: Listing) {
  const hoa = hoaMonthly(listing);
  const ppsf = pricePerSqft(listing);
  const payment = estimatePayment({
    price: listing.price,
    downPaymentPct: 20,
    annualRatePct: 6.5,
    termYears: 30,
    annualTaxes: listing.taxes,
    insuranceAnnual: defaultInsuranceAnnual(listing.price),
    hoaMonthly: hoa,
    includePmi: false,
  });
  return {
    address: `${listing.address}, ${listing.city}, ${listing.state}${listing.zip ? ` ${listing.zip}` : ""}`,
    neighborhood: listing.neighborhood,
    borough: listing.borough,
    status: statusLabel(listing),
    price: listing.price,
    priceLabel: formatPrice(listing.price),
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft,
    type: listing.type,
    yearBuilt: listing.yearBuilt,
    lotSqft: listing.lotSqft,
    heating: listing.heating,
    taxes: listing.taxes,
    hoa,
    ppsf,
    daysOnMarket: daysOnMarket(listing),
    photos: listing.photos.length,
    amenities: listing.stagingLabels ?? [],
    about: listing.about,
    monthlyEstimate: Math.round(payment.total),
    monthlyTaxes: Math.round(payment.taxes),
    monthlyInsurance: Math.round(payment.insurance),
  };
}

export function listingFactText(listing: Listing) {
  const facts = listingFactPack(listing);
  const hoaLine =
    facts.hoa > 0
      ? `HOA / common charges (estimate from size): ${formatPrice(facts.hoa)} per month.`
      : "No HOA in the file. This is not a condo/loft common-charge building in the listing facts.";
  const lotLine =
    facts.lotSqft > 0
      ? `Lot about ${formatNumber(facts.lotSqft)} square feet.`
      : "No private lot in the facts. Outdoor space, if any, is as photographed.";
  return [
    `${facts.address}. ${facts.neighborhood}, ${facts.borough}.`,
    `Status: ${facts.status}. List / recorded price ${facts.priceLabel}. ${facts.type}, ${facts.beds} bedrooms, ${bathsLabel(facts.baths)}, about ${formatNumber(facts.sqft)} square feet.`,
    facts.ppsf ? `About ${formatPrice(facts.ppsf)} per square foot.` : "",
    `Year built ${facts.yearBuilt}. Heating: ${facts.heating}. Annual taxes in the file: ${formatPrice(facts.taxes)}.`,
    hoaLine,
    lotLine,
    facts.daysOnMarket != null
      ? `Days on Realora: ${facts.daysOnMarket}. ${facts.photos} photos.`
      : `${facts.photos} photos.`,
    `Illustrative monthly payment at 20% down, 6.5%, 30-year: about ${formatPrice(facts.monthlyEstimate)}, including taxes and insurance${facts.hoa ? " and HOA" : ""}. Not a loan offer.`,
    facts.amenities.length ? `Amenities / staging: ${facts.amenities.join(", ")}.` : "",
    "Listing copy:",
    ...facts.about,
    "Confirm availability, pricing, and legal status with counsel before you rely on any figure.",
  ]
    .filter(Boolean)
    .join("\n");
}

function expandFollowUp(message: string, history: ChatTurn[]) {
  const words = message.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 6) return message.trim();
  const prior = [...history].reverse().find((turn) => turn.role === "user")?.content;
  if (!prior) return message.trim();
  if (
    /^(and|what about|how about|also|the|that|it|this)\b/i.test(message.trim()) ||
    words.length <= 4
  ) {
    return `${prior} ${message.trim()}`;
  }
  return message.trim();
}

function has(q: string, pattern: RegExp) {
  return pattern.test(q);
}

function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((row) => row.trim())
    .filter((row) => row.length > 20);
}

function aboutHits(listing: Listing, q: string) {
  const tokens = q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3 && !STOP.has(token));
  if (!tokens.length) return [];
  const lines = listing.about.flatMap(sentences);
  return lines.filter((line) => {
    const hay = line.toLowerCase();
    return tokens.some((token) => hay.includes(token));
  });
}

const STOP = new Set([
  "what",
  "whats",
  "which",
  "when",
  "where",
  "does",
  "this",
  "that",
  "have",
  "about",
  "home",
  "house",
  "listing",
  "property",
  "there",
  "here",
  "with",
  "from",
  "tell",
  "give",
  "much",
  "many",
  "please",
]);

export function answerListingQuestion(
  listing: Listing,
  message: string,
  history: ChatTurn[] = [],
) {
  const question = expandFollowUp(message, history);
  const q = question.toLowerCase();

  if (lintFairHousing(question).length || STEERING.test(q)) {
    return FAIR_HOUSING_REPLY;
  }

  if (/^(hi|hello|hey|yo)\b/.test(q)) {
    return `Ask me anything in this listing file for ${listing.address} — price, rooms, taxes, year built, heating, or the description.`;
  }
  if (/^(thanks|thank you|thx)\b/.test(q)) {
    return "You're welcome. Ask another question about this home if you want.";
  }

  const facts = listingFactPack(listing);
  const bits: string[] = [];

  if (has(q, /\b(price|cost|asking|list price|how much (is|does)|sold for)\b/)) {
    bits.push(
      listing.status === "closed"
        ? `The recorded sale price is ${facts.priceLabel}.`
        : `The list price is ${facts.priceLabel}.`,
    );
    if (facts.ppsf) bits.push(`That's about ${formatPrice(facts.ppsf)} per square foot.`);
  }

  if (has(q, /\b(bed|beds|bedroom|bedrooms|br)\b/)) {
    bits.push(`The file lists ${facts.beds} bedroom${facts.beds === 1 ? "" : "s"}.`);
  }

  if (has(q, /\b(bath|baths|bathroom|bathrooms|ba)\b/)) {
    bits.push(`Baths are listed as ${facts.baths}.`);
  }

  if (has(q, /\b(sqft|sq ft|square foot|square feet|size|how big)\b/)) {
    bits.push(`Interior size is about ${formatNumber(facts.sqft)} square feet.`);
  }

  if (has(q, /\b(type|condo|townhouse|loft|house|what kind|property type)\b/)) {
    bits.push(`This is listed as a ${facts.type.toLowerCase()}.`);
  }

  if (has(q, /\b(year|built|age|how old|new construction)\b/)) {
    bits.push(`Year built is ${facts.yearBuilt}.`);
  }

  if (has(q, /\b(tax|taxes|property tax|assessment)\b/)) {
    bits.push(
      `Annual taxes in the file are ${formatPrice(facts.taxes)} (about ${formatPrice(facts.monthlyTaxes)} a month). Confirm with the NYC Department of Finance.`,
    );
  }

  if (has(q, /\b(hoa|common charge|maintenance|carrying cost)\b/)) {
    bits.push(
      facts.hoa > 0
        ? `There is no board-published HOA in the listing file. The monthly estimate on this page uses about ${formatPrice(facts.hoa)} from size, for orientation only.`
        : "No HOA or common charge is in the listing facts. Townhouses and houses here typically don't carry a condo HOA line.",
    );
  }

  if (has(q, /\b(heat|heating|cooling|ac|air condition|hvac)\b/)) {
    bits.push(`Heating / cooling is listed as ${facts.heating}.`);
  }

  if (has(q, /\b(outdoor|outside|garden|yard|lot|terrace|roof|patio|balcony)\b/)) {
    bits.push(
      facts.lotSqft > 0
        ? `The facts file lists a lot of about ${formatNumber(facts.lotSqft)} square feet. Treat garden, terrace, or roof photos as staging until you confirm what conveys.`
        : "No private lot is in the facts. Outdoor space, if any, is a terrace, balcony, or building amenity as photographed.",
    );
  }

  if (has(q, /\b(where|address|location|neighborhood|borough|zip)\b/)) {
    bits.push(
      `It's at ${facts.address}, in ${facts.neighborhood}, ${facts.borough}.`,
    );
  }

  if (has(q, /\b(monthly|mortgage|payment|carry|carrying|pitia)\b/)) {
    bits.push(
      `The illustrative monthly payment on this page is about ${formatPrice(facts.monthlyEstimate)} at 20% down, 6.5%, 30 years, including taxes and insurance${facts.hoa ? " and the HOA line" : ""}. Not a loan offer.`,
    );
  }

  if (has(q, /\b(photo|photos|picture|pictures|gallery|images)\b/)) {
    bits.push(
      listing.status === "closed"
        ? "Sold homes show the cover image only."
        : `This listing file has ${facts.photos} photos. Open the gallery on the page to see them.`,
    );
  }

  if (has(q, /\b(amenit|feature|doorman|elevator|parking|dishwasher|washer|dryer)\b/)) {
    bits.push(
      facts.amenities.length
        ? `Amenities in the file: ${facts.amenities.join(", ")}. Count finishes on a walkthrough.`
        : "The facts file doesn't list extra amenities beyond what's in the copy and photos.",
    );
  }

  if (has(q, /\b(status|sold|available|for sale|pending|in contract|days on)\b/)) {
    bits.push(
      facts.daysOnMarket != null
        ? `Status is ${facts.status}, with ${facts.daysOnMarket} days on Realora.`
        : `Status is ${facts.status}.`,
    );
  }

  if (has(q, /\b(mls)\b/)) {
    bits.push("No MLS number is stored on this listing.");
  }

  if (has(q, /\b(offer|bid|how much should i|win|chance)\b/)) {
    bits.push(
      listing.status === "closed"
        ? "This home has already closed, so there is no offer guide."
        : "Use the offer guide on this page for an estimate of how an offer sits versus list. It is not an appraisal or an acceptance guarantee.",
    );
  }

  if (has(q, /\b(buy now|how do i buy|purchase|make an offer|wizard)\b/)) {
    bits.push(
      listing.status === "closed"
        ? "This sale is already recorded, so Buy now is hidden."
        : "Use Buy now on this page to walk through the offer flow.",
    );
  }

  if (has(q, /\b(describe|overview|tell me|about this|what's it like|whats it like|summary)\b/)) {
    const lead = listing.about.find((paragraph) => paragraph.trim());
    bits.push(
      lead ??
        `A ${facts.beds}-bedroom ${facts.type.toLowerCase()} of about ${formatNumber(facts.sqft)} square feet at ${listing.address}.`,
    );
  }

  if (bits.length) {
    return bits.join(" ");
  }

  const copy = aboutHits(listing, q);
  if (copy.length) {
    return `${copy.slice(0, 2).join(" ")} That's from the listing copy on this page.`;
  }

  if (
    has(
      q,
      /\b(weather|recipe|stock|president|sports|movie|code|javascript|python)\b/,
    )
  ) {
    return OFF_TOPIC_REPLY;
  }

  return `This ${facts.type.toLowerCase()} at ${listing.address} is ${facts.status} at ${facts.priceLabel}, with ${facts.beds} bedrooms, ${bathsLabel(facts.baths)}, and about ${formatNumber(facts.sqft)} square feet. Ask about taxes, year built, heating, outdoor space, or the description if you want a specific fact.`;
}

export const LISTING_CHAT_SYSTEM = `You answer questions about one REALORA listing for a buyer on the listing page.
Use ONLY the listing facts provided. If a fact is missing, say it is not in the file — never invent boards, schools, crime, or who should live here.
Fair housing: refuse schools-for-kids, crime, demographics, religion, and steering. Do not say a home is good for families, couples, or any protected class.
Confirm availability, pricing, and legal status before relying on a number. Say when a figure is only in the listing file.
Keep answers to 2–4 short sentences. No markdown headings. No Zillow branding.`;
