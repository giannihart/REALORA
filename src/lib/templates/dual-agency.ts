import type { TemplateDoc } from "./types";

export function dualAgencyTemplate(input: {
  sellerName: string;
  buyerName: string;
  address: string;
  date: string;
  brokerageName?: string;
}): TemplateDoc {
  const brokerage = input.brokerageName ?? "REALORA";
  return {
    kind: "dual-agency-consent",
    version: 1,
    title: "Dual / Designated Agency Consent",
    subtitle: "Informed consent of both sides",
    paragraphs: [
      `As of ${input.date}, ${brokerage} (or its licensed brokers) may act as a dual or designated agent in the proposed transaction for ${input.address}.`,
      "A dual agent does not represent the interests of either party to the exclusion of the other. Confidential information of one party will not be disclosed to the other without consent, except as required by law.",
      "Both Seller and Buyer consent to this arrangement. This document is generated from platform records when a deal has parties on both sides.",
    ],
    fields: [
      { label: "Property", value: input.address },
      { label: "Seller", value: input.sellerName },
      { label: "Buyer", value: input.buyerName },
    ],
    signers: [
      { role: "Seller", name: input.sellerName },
      { role: "Buyer", name: input.buyerName },
    ],
  };
}
