import type { TimelineStage } from "@/components/portal/Timeline";
import { deriveVerificationTier, verificationBadge } from "@/lib/offers";
import type {
  Deal,
  DealState,
  DocumentItem,
  Offer,
  OfferVerificationTier,
} from "@/lib/types";
import { atLeast } from "@/lib/deal-machine";

export type FinancingDocRowStatus = "Uploaded" | "Under review";

export type FundsLeadStatus = "Not verified" | "Under review" | "Verified";

const PREAPPROVAL_NAME = /pre-?approval|lender letter|financing letter/i;
const POF_NAME = /proof of funds|funds verification|proof-of-funds/i;

export function isCashPath(offer: Offer | undefined): boolean {
  return offer?.financing === "Cash";
}

export function activeBuyerOffer(offers: Offer[]): Offer | undefined {
  return (
    offers.find((o) => o.isBuyerPersona && o.status !== "Declined") ??
    offers.find((o) => o.isBuyerPersona)
  );
}

/** Document rows never produce Verified — only Uploaded / Under review. */
export function financingDocRowStatus(doc: DocumentItem): FinancingDocRowStatus {
  if (doc.status === "For review" || doc.status === "Signed") return "Under review";
  return "Uploaded";
}

export function findProofOfFundsDocs(docs: DocumentItem[]): DocumentItem[] {
  return docs.filter(
    (d) =>
      POF_NAME.test(d.name) ||
      String(d.group).toLowerCase().includes("proof") ||
      d.group === ("proof_of_funds" as DocumentItem["group"]) ||
      /proof_of_funds/i.test(d.storagePath ?? ""),
  );
}

export function findPreApprovalDocs(docs: DocumentItem[]): DocumentItem[] {
  return docs.filter(
    (d) =>
      PREAPPROVAL_NAME.test(d.name) || /pre_approval/i.test(d.storagePath ?? ""),
  );
}

export function fundsLeadStatus(
  offer: Offer | undefined,
  docs: DocumentItem[],
): FundsLeadStatus {
  if (offer?.verifiedFunds) return "Verified";
  const pof = findProofOfFundsDocs(docs);
  if (pof.length > 0) return "Under review";
  return "Not verified";
}

export function preapprovalLeadStatus(
  offer: Offer | undefined,
  docs: DocumentItem[],
  preapprovalStatus?: string | null,
): FundsLeadStatus {
  if (preapprovalStatus === "verified") return "Verified";
  if (offer) {
    const tier = deriveVerificationTier(
      offer.financing,
      offer.verifiedFunds,
      offer.verificationTier,
    );
    if (
      tier === "preapproved_docs_verified" ||
      tier === "fully_underwritten" ||
      (offer.verifiedFunds && offer.financing !== "Cash")
    ) {
      return "Verified";
    }
  }
  if (findPreApprovalDocs(docs).length > 0) return "Under review";
  return "Not verified";
}

export function depositStatus(deal: Deal): "Pending" | "Confirmed" {
  return atLeast(deal.state, "IN_CONTRACT") ? "Confirmed" : "Pending";
}

export function sellerRaiseLine(offer: Offer): string {
  if (offer.financing === "Cash") {
    return "Verifying your funds moves you to Cash — funds verified.";
  }
  return "A verified pre-approval letter moves you to Pre-approved — documents verified.";
}

export function sellerBadgeLine(offer: Offer): string {
  return verificationBadge(offer);
}

export function derivedTierForOffer(offer: Offer): OfferVerificationTier {
  return deriveVerificationTier(offer.financing, offer.verifiedFunds, null);
}

function stage(
  id: string,
  order: number,
  title: string,
  status: TimelineStage["status"],
): TimelineStage {
  return { id, order, title, status };
}

function firstOpen(stages: TimelineStage[]): TimelineStage | null {
  return (
    stages.find((s) => s.status === "In Progress") ??
    stages.find((s) => s.status === "Upcoming") ??
    null
  );
}

/** Cash path milestones — no underwriting; no appraisal without a contract field. */
export function cashFinancingStages(
  deal: Deal,
  offer: Offer | undefined,
  docs: DocumentItem[],
): TimelineStage[] {
  const funds = fundsLeadStatus(offer, docs);
  const deposit = depositStatus(deal);
  const pofStatus: TimelineStage["status"] =
    funds === "Verified" ? "Complete" : funds === "Under review" ? "In Progress" : "Upcoming";
  const depositStage: TimelineStage["status"] =
    deposit === "Confirmed"
      ? "Complete"
      : pofStatus === "Complete"
        ? "In Progress"
        : "Upcoming";
  const closingFunds: TimelineStage["status"] =
    deposit === "Confirmed" && atLeast(deal.state, "CLEAR_TO_CLOSE")
      ? "Complete"
      : deposit === "Confirmed"
        ? "In Progress"
        : "Upcoming";

  return [
    stage("cash-pof", 1, "Proof of funds", pofStatus),
    stage("cash-deposit", 2, "Deposit confirmed", depositStage),
    stage("cash-closing", 3, "Closing funds ready", closingFunds),
  ];
}

/** Financed path milestones. */
export function financedFinancingStages(
  deal: Deal,
  offer: Offer | undefined,
  docs: DocumentItem[],
): TimelineStage[] {
  const pre = preapprovalLeadStatus(offer, docs);
  const appStatus: TimelineStage["status"] =
    pre === "Verified" ? "Complete" : pre === "Under review" ? "In Progress" : "Upcoming";

  const appraisalStatus: TimelineStage["status"] = atLeast(deal.state, "CLEAR_TO_CLOSE")
    ? "Complete"
    : atLeast(deal.state, "DILIGENCE") && appStatus === "Complete"
      ? "In Progress"
      : "Upcoming";

  const uwStatus: TimelineStage["status"] = atLeast(deal.state, "CLEAR_TO_CLOSE")
    ? "Complete"
    : appraisalStatus === "Complete" ||
        (atLeast(deal.state, "DILIGENCE") && appStatus === "Complete")
      ? "In Progress"
      : "Upcoming";

  const conditionsStatus: TimelineStage["status"] = atLeast(deal.state, "CLOSING")
    ? "Complete"
    : atLeast(deal.state, "CLEAR_TO_CLOSE")
      ? "In Progress"
      : "Upcoming";

  const ctcStatus: TimelineStage["status"] = atLeast(deal.state, "CLOSING")
    ? "Complete"
    : atLeast(deal.state, "CLEAR_TO_CLOSE")
      ? "In Progress"
      : "Upcoming";

  return [
    stage("fin-app", 1, "Application", appStatus),
    stage("fin-appraisal", 2, "Appraisal", appraisalStatus),
    stage("fin-uw", 3, "Underwriting", uwStatus),
    stage("fin-conditions", 4, "Conditions", conditionsStatus),
    stage("fin-ctc", 5, "Clear to close", ctcStatus),
  ];
}

export function financingStagesFor(
  deal: Deal,
  offer: Offer | undefined,
  docs: DocumentItem[],
): TimelineStage[] {
  return isCashPath(offer)
    ? cashFinancingStages(deal, offer, docs)
    : financedFinancingStages(deal, offer, docs);
}

export function nextFinancingMilestone(
  deal: Deal,
  offer: Offer | undefined,
  docs: DocumentItem[],
): TimelineStage | null {
  return firstOpen(financingStagesFor(deal, offer, docs));
}

export function verifiedDateLabel(offer: Offer | undefined, docs: DocumentItem[]): string | null {
  if (!offer?.verifiedFunds) return null;
  const pool = isCashPath(offer) ? findProofOfFundsDocs(docs) : findPreApprovalDocs(docs);
  const dated = pool.find((d) => d.date);
  return dated?.date ?? null;
}
