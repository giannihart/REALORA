import type { TemplateDoc } from "./types";

export function sellerLoiTemplate(input: {
  sellerName: string;
  address: string;
  date: string;
}): TemplateDoc {
  return {
    kind: "seller-loi",
    version: 1,
    title: "Seller Letter of Intent",
    subtitle: "Pre-listing · non-binding",
    notice:
      "THIS LETTER OF INTENT IS NON-BINDING. It records Seller's intent to list with REALORA. It does not create a listing, agency, or sale obligation.",
    paragraphs: [
      `${input.sellerName} ("Seller") intends, as of ${input.date}, to list ${input.address} with REALORA subject to a signed listing agreement.`,
      "No commission is earned by this letter. No exclusive is granted by this letter. The listing agreement, once signed, is the operative contract.",
      "This document is labeled non-binding on its face so it cannot be mistaken for an executed listing.",
    ],
    fields: [
      { label: "Property", value: input.address },
      { label: "Seller", value: input.sellerName },
      { label: "Character", value: "Non-binding pre-listing letter of intent" },
    ],
    signers: [{ role: "Seller", name: input.sellerName }],
  };
}
