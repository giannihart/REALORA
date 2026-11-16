import type { TemplateDoc } from "./types";

export function propertyConditionTemplate(input: {
  sellerName: string;
  address: string;
  date: string;
  electCredit?: boolean;
}): TemplateDoc {
  return {
    kind: "property-condition-disclosure",
    version: 1,
    title: "Property Condition Disclosure Statement",
    subtitle: input.electCredit
      ? "Seller elects the $500 credit in lieu of a completed statement"
      : "Article 14 of the New York Real Property Law",
    notice: input.electCredit
      ? "SELLER ELECTS TO PROVIDE A $500 CREDIT TO THE BUYER IN LIEU OF A COMPLETED PROPERTY CONDITION DISCLOSURE STATEMENT."
      : undefined,
    paragraphs: input.electCredit
      ? [
          `${input.sellerName} elects, as of ${input.date}, to give a five hundred dollar credit to the buyer at closing instead of delivering a completed Property Condition Disclosure Statement for ${input.address}.`,
          "This election is recorded on the platform. Counsel should confirm the credit appears in the contract of sale.",
        ]
      : [
          `${input.sellerName} provides this Property Condition Disclosure Statement for ${input.address} as of ${input.date}.`,
          "Complete each known-defect item with counsel. This generated packet is a signature vehicle, not a substitute for a fully answered statutory form.",
        ],
    fields: [
      { label: "Property", value: input.address },
      { label: "Seller", value: input.sellerName },
      { label: "Election", value: input.electCredit ? "$500 credit in lieu of statement" : "Statement to be completed" },
    ],
    signers: [{ role: "Seller", name: input.sellerName }],
  };
}
