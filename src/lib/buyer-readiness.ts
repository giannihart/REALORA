import type { BuyingPowerProfile } from "@/lib/buying-power";
import {
  findPreApprovalDocs,
  findProofOfFundsDocs,
  sellerRaiseLine,
} from "@/lib/buyer-financing";
import {
  deriveVerificationTier,
  effectiveOfferStatus,
  VERIFICATION_BADGE,
} from "@/lib/offers";
import type {
  DocumentItem,
  FinancingPath,
  FinancingType,
  Listing,
  Offer,
  OfferVerificationTier,
  UserSession,
} from "@/lib/types";

export type ReadinessStepId =
  | "buying-power"
  | "identity"
  | "financing";

export type ReadinessStepState = "complete" | "in_progress" | "todo";

export type ReadinessStep = {
  id: ReadinessStepId;
  title: string;
  state: ReadinessStepState;
  optional?: boolean;
  detail?: string;
  subline?: string;
  actionLabel: string;
};

export function resolveFinancingPath(input: {
  prefsPath: FinancingPath | null | undefined;
  documents: DocumentItem[];
}): FinancingPath | null {
  if (input.prefsPath === "cash" || input.prefsPath === "financed") {
    return input.prefsPath;
  }
  const hasPof = findProofOfFundsDocs(input.documents).length > 0;
  const hasPre = findPreApprovalDocs(input.documents).length > 0;
  if (hasPof && !hasPre) return "cash";
  if (hasPre && !hasPof) return "financed";
  return null;
}

export function fundsVerified(user: UserSession, offers: Offer[]): boolean {
  // Cash path: funds_status. Financed path: preapproval_status. Paths stay distinct.
  if (user.fundsStatus === "verified") return true;
  if (user.preapprovalStatus === "verified") return true;
  return offers.some((o) => o.isBuyerPersona && o.verifiedFunds);
}

function financingDocsForPath(path: FinancingPath | null, docs: DocumentItem[]) {
  if (path === "cash") return findProofOfFundsDocs(docs);
  if (path === "financed") return findPreApprovalDocs(docs);
  return [...findProofOfFundsDocs(docs), ...findPreApprovalDocs(docs)];
}

export function prospectiveTier(
  path: FinancingPath | null,
  verified: boolean,
): OfferVerificationTier {
  const financing: FinancingType = path === "cash" ? "Cash" : "Conventional";
  return deriveVerificationTier(financing, verified, null);
}

export function prospectiveBadge(
  path: FinancingPath | null,
  verified: boolean,
): string {
  return VERIFICATION_BADGE[prospectiveTier(path, verified)];
}

export function prospectiveRaiseLine(
  path: FinancingPath | null,
  verified = false,
): string | null {
  if (!path) return null;
  // Already on the top rung for this path — no further raise to promise.
  if (verified) return null;
  return sellerRaiseLine({
    financing: path === "cash" ? "Cash" : "Conventional",
  } as Offer);
}

export function buildReadinessSteps(input: {
  buyingPower: BuyingPowerProfile | null;
  user: UserSession;
  documents: DocumentItem[];
  offers: Offer[];
}): {
  steps: ReadinessStep[];
  readyCount: number;
  nextId: ReadinessStepId | null;
  allReady: boolean;
  financingPath: FinancingPath | null;
} {
  const path = resolveFinancingPath({
    prefsPath: input.user.financingPath,
    documents: input.documents,
  });
  const verified = fundsVerified(input.user, input.offers);
  const pathDocs = financingDocsForPath(path, input.documents);

  const bp: ReadinessStep = {
    id: "buying-power",
    title: "Know your buying power",
    optional: true,
    state: input.buyingPower ? "complete" : "todo",
    actionLabel: input.buyingPower ? "Update buying power" : "Find my buying power",
  };

  const identity: ReadinessStep = {
    id: "identity",
    title: "Verify your identity",
    state: input.user.verifiedId ? "complete" : "todo",
    subline:
      "Sellers see verified buyers first — this is part of your offer, not paperwork.",
    actionLabel: "Verify identity",
  };

  let financingState: ReadinessStepState = "todo";
  if (verified) financingState = "complete";
  else if (path && pathDocs.length > 0) financingState = "in_progress";

  const financing: ReadinessStep = {
    id: "financing",
    title: "Prove your financing",
    state: financingState,
    detail:
      financingState === "in_progress"
        ? "Under review"
        : financingState === "complete"
          ? path === "cash"
            ? "Funds verified"
            : "Pre-approval verified"
          : undefined,
    actionLabel: !path
      ? "Upload proof"
      : path === "cash"
        ? "Upload proof of funds"
        : "Upload pre-approval letter",
  };

  const steps = [bp, identity, financing];
  const readyCount = steps.filter((s) => s.state === "complete").length;
  const next = steps.find((s) => s.state !== "complete") ?? null;

  return {
    steps,
    readyCount,
    nextId: next?.id ?? null,
    allReady: readyCount === 3,
    financingPath: path,
  };
}

export function declinedOfferNotice(
  offers: Offer[],
  listings: Listing[],
): { offer: Offer; homeLabel: string } | null {
  const closed = offers
    .filter((o) => o.isBuyerPersona)
    .map((o) => ({ offer: o, status: effectiveOfferStatus(o) }))
    .filter((row) => row.status === "Declined" || row.status === "Expired")
    .sort((a, b) => b.offer.createdAt.localeCompare(a.offer.createdAt));
  const hit = closed[0];
  if (!hit) return null;
  const listing = listings.find((l) => l.id === hit.offer.listingId);
  const homeLabel = listing
    ? listing.address
    : hit.offer.listingId.replace(/-/g, " ");
  return { offer: hit.offer, homeLabel };
}
