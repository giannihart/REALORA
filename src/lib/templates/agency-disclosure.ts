import type { TemplateDoc } from "./types";

export function agencyDisclosureTemplate(input: {
  partyName: string;
  address: string;
  date: string;
  brokerageName?: string;
}): TemplateDoc {
  const brokerage = input.brokerageName ?? "REALORA";
  return {
    kind: "agency-disclosure",
    version: 1,
    title: "New York Agency Disclosure Acknowledgment",
    subtitle: "Section 443 of the New York Real Property Law",
    paragraphs: [
      `The undersigned acknowledges receipt of the New York State Disclosure Form for Buyer and Seller, describing the agency relationships that may exist in the sale of ${input.address}.`,
      `${brokerage} and its licensed brokers explain whether they represent the seller, the buyer, or both (with informed consent). This acknowledgment records that the explanation was given. It is not a listing agreement or a buyer-broker agreement.`,
      `Dated ${input.date}.`,
    ],
    fields: [
      { label: "Property", value: input.address },
      { label: "Acknowledging party", value: input.partyName },
    ],
    signers: [{ role: "Party", name: input.partyName }],
  };
}
