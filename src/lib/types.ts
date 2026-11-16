export type DealState =
  | "INTAKE"
  | "PREP"
  | "LIVE"
  | "TOURS_OFFERS"
  | "ACCEPTED"
  | "CONTRACT"
  | "IN_CONTRACT"
  | "DILIGENCE"
  | "CLEAR_TO_CLOSE"
  | "CLOSING"
  | "POST_CLOSE"
  | "FELL_THROUGH";

export type ListingBadge = "New Listing" | "Price Cut";
export type ListingStatus = "draft" | "live" | "in_contract" | "closed" | "withdrawn";
export type HomeType = "Townhouse" | "Condo" | "Loft" | "House";
export type FinancingType = "Cash" | "Conventional" | "Jumbo";
export type OfferStatus =
  | "New"
  | "Viewed"
  | "Accepted"
  | "Countered"
  | "Declined"
  | "Expired";
/** @deprecated Ranking and verification badges replace certainty adjectives. */
export type CertaintyLabel =
  | "Strongest certainty"
  | "Competitive"
  | "Highest price";
/** R4 buyer verification state shown on seller offer cards. */
export type OfferVerificationTier =
  | "cash_funds_verified"
  | "fully_underwritten"
  | "preapproved_docs_verified"
  | "self_reported";
export type TaskStatus = "In Progress" | "Waiting" | "Complete";
export type MilestoneStatus = "Complete" | "In Progress" | "Upcoming";
export type DocumentStatus = "Signed" | "Pending" | "For review";
export type DocumentGroup =
  | "Contract"
  | "Inspection report"
  | "Title"
  | "Disclosures"
  | "Closing"
  | "Listing";
export type VendorCategory =
  | "Inspector"
  | "Photographer"
  | "Movers"
  | "Cleaners"
  | "Locksmith"
  | "Expediter";
export type Role = "buyer" | "seller";

export interface Listing {
  id: string;
  title: string;
  address: string;
  neighborhood: string;
  borough: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  type: HomeType;
  yearBuilt: number;
  lotSqft: number;
  heating: string;
  taxes: number;
  badge?: ListingBadge;
  photos: string[];
  objectPosition?: string;
  about: string[];
  pin: { x: number; y: number };
  pinLabel: string;
  lat?: number;
  lng?: number;
  isDemoDeal: boolean;
  marketplace: boolean;
  status: ListingStatus;
  offerBuyerAgentPercent: 0 | 1;
  stagingLabels: string[];
  syndication: {
    channel: string;
    live: boolean;
    at: string;
  }[];
  sellerId?: string;
  createdAt?: string;
  mediaCostCents?: number;
  campaignCostCents?: number;
  /** Broker-facing pricing note stored on the property payload. */
  pricingGuidance?: string | null;
  /** True when the listing was created from public sell intake. */
  fromOnboarding?: boolean;
}

export interface Offer {
  id: string;
  listingId: string;
  buyerLabel: string;
  isBuyerPersona: boolean;
  price: number;
  financing: FinancingType;
  downPercent: number;
  emd: number;
  closeDate: string;
  expires: string;
  status: OfferStatus;
  inspectionContingency: boolean;
  financingContingency: boolean;
  verifiedFunds: boolean;
  /** Buyer's agent attached on the offer — drives co-broke fee math. */
  agentAttached: boolean;
  /** R4 verification tier; loan type stays separate on `financing`. */
  verificationTier: OfferVerificationTier;
  concessions: number;
  /** AE-entered note only — replaces the generated Realora read when set. */
  note: string;
  /** @deprecated Prefer verificationTier + ranking. */
  certaintyLabel: CertaintyLabel;
  score: number;
  createdAt: string;
}

export interface OfferDraft {
  listingId: string;
  price: number;
  emd: number;
  closeDate: string;
  financing: FinancingType;
  downPercent: number;
  inspectionContingency: boolean;
  financingContingency: boolean;
  verifiedFunds: boolean;
  agentAttached?: boolean;
  verificationTier?: OfferVerificationTier;
  concessions?: number;
}

export interface NextStep {
  title: string;
  body: string;
  cta: string;
  ctaHref?: string;
  ctaAction?:
    | "schedule-inspection"
    | "review-offers"
    | "open-wizard"
    | "browse-homes"
    | "mark-contract"
    | "confirm-deposit"
    | "resend-signature";
  due?: string;
}

export interface HandlingTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  cta?: string;
  ctaAction?: NextStep["ctaAction"];
  documentId?: string;
}

export interface MilestoneAction {
  label: string;
  href: string;
}

export interface Milestone {
  id: string;
  index: number;
  title: string;
  status: MilestoneStatus;
  completedOn?: string;
  targetDate?: string;
  description?: string;
  responsible?: string;
  next?: string;
  actions?: MilestoneAction[];
}

export interface Deadline {
  item: string;
  date: string;
}

export interface ComingUpItem {
  title: string;
  date?: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  group: DocumentGroup;
  uploadedBy: string;
  date: string;
  status: DocumentStatus;
  body: string;
  role: Role | "both";
  dealId?: string;
  storagePath?: string | null;
  visibility?: "shared" | "seller_side" | "buyer_side";
  signStatus?: string | null;
  extracted?: import("@/lib/services/extraction-types").ExtractedPayload | null;
  uploaderId?: string | null;
}

export type VendorTier = "assigned" | "curated" | "concierge";

export interface ServiceVendor {
  id: string;
  name: string;
  category: VendorCategory;
  price: number;
  rating: number;
  reviews: number;
  blurb: string;
  tier: VendorTier;
  /** Within curated categories — Realora's default pick. */
  recommended?: boolean;
  stripeReady?: boolean;
  setupRequired?: boolean;
}

export type ConciergeCategory = "Movers" | "Cleaners" | "Locksmith";

/** Bring-your-own provider — coordination only; optional quoted fee for inspectors. */
export type OwnProviderDetails = {
  name: string;
  contact: string;
  note?: string;
  /** Fee they quoted the buyer (dollars). Used for Inspector; Realora does not mark up. */
  quotedPrice?: number;
};

export interface AssignmentItem {
  id: string;
  title: string;
  description: string;
  status: string;
  due: string | null;
  dealId: string;
}

export interface PartyDeal {
  id: string;
  address: string;
  state: string;
  role: string;
}

export interface Booking {
  id: string;
  vendorId: string;
  date: string;
  time: string;
  createdAt: string;
}

export interface MessageThread {
  id: string;
  name: string;
  preview: string;
  unread: number;
  role: Role | "both";
}

export interface ChatMessage {
  id: string;
  threadId: string;
  sender: string;
  body: string;
  at: string;
  fromUser: boolean;
}

export interface Deal {
  listingId: string;
  state: DealState;
  fellThroughReason?: string;
  inspectionBooked: boolean;
  inspectionReportReviewed: boolean;
  acceptedOfferId: string | null;
  preApprovalUploaded: boolean;
  contractDocumentId?: string | null;
  /** Concierge NextStepCards permanently dismissed for this deal. */
  dismissedConcierge?: ConciergeCategory[];
  /** Bring-your-own inspector (coordination only — no platform payment). */
  ownInspector?: OwnProviderDetails | null;
  /** Panel or own selection per service category (vendor id, or "own"). */
  serviceSelections?: Partial<Record<VendorCategory, string>>;
  /** Bring-your-own provider details by category. */
  ownProviders?: Partial<Record<VendorCategory, OwnProviderDetails>>;
  /** Terminal completion outcomes when not derivable from other fields. */
  serviceCompleted?: Partial<
    Record<VendorCategory, { at: string; outcome: string }>
  >;
}

export type FinancingPath = "cash" | "financed";

export interface UserSession {
  signedIn: boolean;
  role: Role;
  email: string;
  name: string;
  verifiedId: boolean;
  verifiedOwnership: boolean;
  id?: string;
  /** From verifications.funds_status — cash-path AE confirmation, never self-attest. */
  fundsStatus?: string;
  /** From verifications.preapproval_status — financed-path AE confirmation. */
  preapprovalStatus?: string;
  /** AE-recorded approved amount (dollars) when pre-approval is confirmed. */
  approvedAmount?: number | null;
  /** Lender name recorded at pre-approval confirmation. */
  preapprovalLenderName?: string | null;
  /** ISO timestamp of AE pre-approval confirmation. */
  preapprovalConfirmedAt?: string | null;
  /** Buyer cash vs financed preference (notification_prefs.financingPath). */
  financingPath?: FinancingPath | null;
}

/** Party or pending invite row for the deal roster UI. */
export type DealRosterEntry = {
  id: string;
  kind: "party" | "invite";
  name: string;
  email: string;
  role: string;
  side: "seller" | "buyer" | "neutral";
  /** Pending invites only. */
  inviteEmail?: string;
};

/** Client view of designated-agency gate state for overview + acknowledgment card. */
export type DesignatedAgencyView = {
  required: boolean;
  sellerAck: boolean;
  buyerAck: boolean;
  agentsAssigned: boolean;
  mySide: "seller" | "buyer" | null;
  needsMyAck: boolean;
  consentDocumentId: string | null;
  consentDocumentName: string | null;
};

export type { BuyingPowerInputs, BuyingPowerProfile } from "@/lib/buying-power";

export interface SearchFilters {
  location: string;
  forSale: boolean;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  minBaths?: number;
  homeType?: HomeType | "Any";
}

export interface TourFeedback {
  id: string;
  when: string;
  visitor: string;
  note: string;
}

export interface DemoState {
  listings: Listing[];
  offers: Offer[];
  deal: Deal;
  savedListingIds: string[];
  bookings: Booking[];
  documents: DocumentItem[];
  messages: ChatMessage[];
  threads: MessageThread[];
  user: UserSession;
  savedSearch: SearchFilters | null;
  tours: TourFeedback[];
  buyingPower: import("@/lib/buying-power").BuyingPowerProfile | null;
}

export interface DealView {
  buyerNext: NextStep;
  sellerNext: NextStep;
  buyerHandling: HandlingTask[];
  sellerHandling: HandlingTask[];
  buyerMilestones: Milestone[];
  sellerMilestones: Milestone[];
  buyerDeadline: Deadline | null;
  sellerDeadline: Deadline | null;
  buyerProgress: { done: number; total: number };
  sellerProgress: { done: number; total: number };
  buyerComingUp: ComingUpItem[];
  sellerComingUp: ComingUpItem[];
  buyerRejected: boolean;
}
