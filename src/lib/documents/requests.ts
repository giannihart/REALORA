import type { Deal, DealState, DocumentGroup, DocumentItem, Role } from "@/lib/types";

export type DocVisibility = "shared" | "seller_side" | "buyer_side";

export type DocumentRequest = {
  id: string;
  title: string;
  hint: string;
  kind: DocumentGroup;
  visibility: DocVisibility;
  audience: string;
  uploader: Role;
  /** Deal states where this request is active. */
  states: DealState[];
  /** Match existing vault files for this request. */
  matchName: RegExp;
};

const REQUESTS: DocumentRequest[] = [
  {
    id: "listing-agreement",
    title: "Listing agreement",
    hint: "Signed listing agreement so Realora can represent the property.",
    kind: "Listing",
    visibility: "seller_side",
    audience: "Seller side only",
    uploader: "seller",
    states: ["INTAKE", "PREP", "LIVE", "TOURS_OFFERS"],
    matchName: /listing/i,
  },
  {
    id: "property-disclosure",
    title: "Property condition disclosure",
    hint: "Required seller disclosure for buyers reviewing the home.",
    kind: "Disclosures",
    visibility: "shared",
    audience: "Both sides",
    uploader: "seller",
    states: ["PREP", "LIVE", "TOURS_OFFERS", "ACCEPTED", "CONTRACT", "IN_CONTRACT"],
    matchName: /condition|property disclosure/i,
  },
  {
    id: "lead-disclosure",
    title: "Lead paint disclosure",
    hint: "Federal disclosure for dwellings built before 1978.",
    kind: "Disclosures",
    visibility: "shared",
    audience: "Both sides",
    uploader: "seller",
    states: ["PREP", "LIVE", "TOURS_OFFERS", "ACCEPTED", "CONTRACT", "IN_CONTRACT"],
    matchName: /lead/i,
  },
  {
    id: "buyer-term-sheet",
    title: "Offer term sheet",
    hint: "Your terms for the seller to compare with other offers.",
    kind: "Contract",
    visibility: "shared",
    audience: "Both sides",
    uploader: "buyer",
    states: ["TOURS_OFFERS", "ACCEPTED"],
    matchName: /term sheet|offer/i,
  },
  {
    id: "buyer-id",
    title: "Government ID",
    hint: "Photo ID for closing identity verification.",
    kind: "Closing",
    visibility: "buyer_side",
    audience: "Buyer side only",
    uploader: "buyer",
    states: ["ACCEPTED", "CONTRACT", "IN_CONTRACT", "DILIGENCE", "CLEAR_TO_CLOSE", "CLOSING"],
    matchName: /id|identity|verification/i,
  },
  {
    id: "pre-approval",
    title: "Pre-approval letter",
    hint: "Lender letter that backs your offer certainty.",
    kind: "Closing",
    visibility: "buyer_side",
    audience: "Buyer side only",
    uploader: "buyer",
    states: ["TOURS_OFFERS", "ACCEPTED", "CONTRACT", "IN_CONTRACT", "DILIGENCE"],
    matchName: /pre-?approval|lender letter|financing letter/i,
  },
  {
    id: "proof-of-funds",
    title: "Proof of funds",
    hint: "Bank letter or statement that backs a cash offer.",
    kind: "Closing",
    visibility: "buyer_side",
    audience: "Buyer side only",
    uploader: "buyer",
    states: ["TOURS_OFFERS", "ACCEPTED", "CONTRACT", "IN_CONTRACT", "DILIGENCE"],
    matchName: /proof of funds|funds verification|proof-of-funds/i,
  },
  {
    id: "executed-contract",
    title: "Executed contract",
    hint: "Fully signed purchase contract from counsel.",
    kind: "Contract",
    visibility: "shared",
    audience: "Both sides",
    uploader: "seller",
    states: ["ACCEPTED", "CONTRACT", "IN_CONTRACT"],
    matchName: /executed|purchase contract|contract(?!.*term)/i,
  },
  {
    id: "inspection-report",
    title: "Inspection report",
    hint: "Upload the report once the inspector delivers it.",
    kind: "Inspection report",
    visibility: "shared",
    audience: "Both sides",
    uploader: "buyer",
    states: ["DILIGENCE"],
    matchName: /inspection/i,
  },
  {
    id: "title-commitment",
    title: "Title commitment",
    hint: "Title report from your settlement provider.",
    kind: "Title",
    visibility: "shared",
    audience: "Both sides",
    uploader: "seller",
    states: ["CLEAR_TO_CLOSE", "CLOSING"],
    matchName: /title/i,
  },
  {
    id: "closing-statement",
    title: "Closing statement",
    hint: "Final closing disclosure or settlement statement.",
    kind: "Closing",
    visibility: "shared",
    audience: "Both sides",
    uploader: "buyer",
    states: ["CLOSING", "POST_CLOSE"],
    matchName: /closing (statement|disclosure)|settlement/i,
  },
];

function satisfied(req: DocumentRequest, docs: DocumentItem[], deal: Deal): boolean {
  if (req.id === "inspection-report" && deal.inspectionReportReviewed) return true;
  return docs.some(
    (d) =>
      req.matchName.test(d.name) &&
      (d.group === req.kind ||
        (req.id === "proof-of-funds" && String(d.group).includes("proof"))),
  );
}

export function documentRequestsFor(
  role: Role,
  deal: Deal,
  docs: DocumentItem[],
): { next: DocumentRequest | null; upcoming: DocumentRequest[]; complete: DocumentRequest[] } {
  const relevant = REQUESTS.filter((r) => r.uploader === role && r.states.includes(deal.state));
  const complete: DocumentRequest[] = [];
  const open: DocumentRequest[] = [];
  for (const req of relevant) {
    if (satisfied(req, docs, deal)) complete.push(req);
    else open.push(req);
  }
  return {
    next: open[0] ?? null,
    upcoming: open.slice(1),
    complete,
  };
}
