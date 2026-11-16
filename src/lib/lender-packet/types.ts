import type { CreditBandId } from "@/lib/buying-power";

/** Bump when send-consent wording changes. */
export const LENDER_PACKET_CONSENT_VERSION = "2026-11-05-zillow-seq";

export const LENDER_PACKET_TIMELINES = [
  "Within 3 months",
  "In 4–6 months",
  "More than 7 months",
  "Not sure",
] as const;

export type LenderPacketTimeline = (typeof LENDER_PACKET_TIMELINES)[number];

export const LENDER_PACKET_PROPERTY_TYPES = [
  "Townhouse or single-family",
  "Condominium",
  "Co-op",
  "Multi-unit",
] as const;

export type LenderPacketPropertyType = (typeof LENDER_PACKET_PROPERTY_TYPES)[number];

export const LENDER_PACKET_OCCUPANCIES = [
  "Primary residence",
  "Second or vacation home",
  "Investment or rental property",
] as const;

export type LenderPacketOccupancy = (typeof LENDER_PACKET_OCCUPANCIES)[number];

export const LENDER_PACKET_FUNDS_TIMING = [
  "It's available now",
  "Within 3 months",
  "Still figuring it out",
] as const;

export type LenderPacketFundsTiming = (typeof LENDER_PACKET_FUNDS_TIMING)[number];

/** Packet-only self-reported bands — not the Buying Power profile CreditBandId. */
export const LENDER_PACKET_CREDIT_BANDS = [
  "720+",
  "660–719",
  "620–659",
  "580–619",
  "579 or below",
] as const;

export type LenderPacketCreditBand = (typeof LENDER_PACKET_CREDIT_BANDS)[number];

/** @deprecated Kept for migration of in-flight drafts; new flow uses selfEmployed. */
export const EMPLOYMENT_STATUSES = [
  "Employed",
  "Self-employed",
  "Retired",
  "Other",
] as const;

export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** Buyer-facing delivery — never expose internal "failed". */
export type LenderPacketBuyerStatus = "prepared" | "sent";

export type LenderPacketDeliveryStatus = "prepared" | "sent" | "failed";

export interface LenderPacketDraft {
  alreadyPreapproved: boolean | null;
  timeline: LenderPacketTimeline | "";
  propertyType: LenderPacketPropertyType | "";
  occupancy: LenderPacketOccupancy | "";
  area: string;
  targetPrice: number;
  /** Buyer-stated comfort ceiling — packet only; does not alter gauge math. */
  comfortMonthlyPayment: number;
  downPayment: number;
  fundsTiming: LenderPacketFundsTiming | "";
  annualIncome: number;
  monthlyDebts: number;
  selfEmployed: boolean | null;
  ownedHomePast3Years: boolean | null;
  militaryAffiliation: boolean | null;
  bankruptcyOrShortSale: boolean | null;
  creditScoreBand: LenderPacketCreditBand | "";
  legalFirstName: string;
  legalLastName: string;
  phone: string;
  currentStreet: string;
  currentUnit: string;
  currentCity: string;
  currentState: string;
  currentZip: string;
  lenderId: string;
  lenderName: string;
  lenderEmail: string;
  byo: boolean;
}

export interface LenderPacketPayload {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  legalFirstName: string;
  legalLastName: string;
  timeline: LenderPacketTimeline;
  area: string;
  propertyType: LenderPacketPropertyType;
  occupancy: LenderPacketOccupancy;
  targetPrice: number;
  comfortMonthlyPayment: number;
  comfortMonthlyPaymentLabel: "buyer-stated";
  downPayment: number;
  fundsTiming: LenderPacketFundsTiming;
  annualIncome: number;
  monthlyDebts: number;
  estimatedBuyingPower: number;
  selfEmployed: boolean;
  ownedHomePast3Years: boolean;
  militaryAffiliation: boolean;
  bankruptcyOrShortSale: boolean;
  creditScoreBand: LenderPacketCreditBand;
  creditScoreBandLabel: string;
  currentAddress: {
    street: string;
    unit: string;
    city: string;
    state: string;
    zip: string;
  };
  lenderName: string;
  lenderEmail: string;
  preparedAt: string;
  /** Legacy field retained for older PDF readers — maps to self-employment. */
  employmentStatus?: string;
  creditBand?: CreditBandId;
  creditBandLabel?: string;
}

export interface LenderPacketRecord {
  id: string;
  userId: string;
  lenderId: string;
  lenderName: string;
  lenderEmail: string;
  payload: LenderPacketPayload;
  pdfStoragePath: string | null;
  consentVersion: string;
  deliveryStatus: LenderPacketDeliveryStatus;
  providerId: string | null;
  createdAt: string;
  sentAt: string | null;
}

export function buyerStatusFromDelivery(
  status: LenderPacketDeliveryStatus,
): LenderPacketBuyerStatus {
  return status === "sent" ? "sent" : "prepared";
}

export const EMPTY_LENDER_PACKET_DRAFT: LenderPacketDraft = {
  alreadyPreapproved: null,
  timeline: "",
  propertyType: "",
  occupancy: "",
  area: "",
  targetPrice: 0,
  comfortMonthlyPayment: 0,
  downPayment: 0,
  fundsTiming: "",
  annualIncome: 0,
  monthlyDebts: 0,
  selfEmployed: null,
  ownedHomePast3Years: null,
  militaryAffiliation: null,
  bankruptcyOrShortSale: null,
  creditScoreBand: "",
  legalFirstName: "",
  legalLastName: "",
  phone: "",
  currentStreet: "",
  currentUnit: "",
  currentCity: "",
  currentState: "",
  currentZip: "",
  lenderId: "",
  lenderName: "",
  lenderEmail: "",
  byo: false,
};

/** Progress labels — one per question screen before gauge, then review. */
export const MORTGAGE_STEP_LABELS = [
  "Pre-approved?",
  "Timeline",
  "Property",
  "Use",
  "Where",
  "Price",
  "Payment",
  "Down",
  "Funds",
  "Income",
  "Debts",
  "Self-employment",
  "Ownership",
  "Military",
  "Credit events",
  "Credit score",
  "Contact",
  "Address",
  "Review",
] as const;

/** Step index (1-based) after which we save Buying Power and later reveal the gauge. */
export const MORTGAGE_DEBTS_STEP = 11;
export const MORTGAGE_ADDRESS_STEP = 18;
export const MORTGAGE_REVIEW_STEP = 19;
export const MORTGAGE_TOTAL_STEPS = 19;
