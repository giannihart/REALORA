import type { TemplateDoc } from "./types";

export function leadPaintTemplate(input: {
  sellerName: string;
  address: string;
  yearBuilt: number;
  date: string;
}): TemplateDoc {
  return {
    kind: "lead-paint-disclosure",
    version: 1,
    title: "Lead-Based Paint Disclosure",
    subtitle: "Housing built before 1978",
    notice: `This dwelling was built in ${input.yearBuilt} and is subject to the federal lead-based paint disclosure rule.`,
    paragraphs: [
      `Seller ${input.sellerName} discloses any known lead-based paint or lead-based paint hazards at ${input.address} and provides any available records or reports.`,
      "Buyer has a 10-day opportunity to inspect for lead-based paint unless waived in writing. This generated packet is a signature vehicle. It is not a completed EPA form by itself.",
      `Dated ${input.date}.`,
    ],
    fields: [
      { label: "Property", value: input.address },
      { label: "Year built", value: String(input.yearBuilt) },
      { label: "Seller", value: input.sellerName },
    ],
    signers: [{ role: "Seller", name: input.sellerName }],
  };
}
