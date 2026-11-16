import type { BuyingPowerInputs, BuyingPowerProfile } from "@/lib/buying-power";
import type {
  DealState,
  DemoState,
  Listing,
  Offer,
  OfferDraft,
  Role,
  SearchFilters,
} from "@/lib/types";
import type { AppSnapshot } from "@/lib/actions/snapshot";

/** Everything the UI currently reads from the Zustand demo store. */
export interface DataProvider extends DemoState {
  hydrated: boolean;
  dealId: string | null;
  listingUuid?: string | null;
  isBroker: boolean;
  canSwitchRoles: boolean;
  appRole: "user" | "broker" | "admin";
  partyRoles: string[];
  assignments?: import("@/lib/types").AssignmentItem[];
  vendors?: import("@/lib/types").ServiceVendor[];
  verificationMode?: "persona" | "test" | "unavailable";
  myDeals?: import("@/lib/types").PartyDeal[];
  dealRoster?: import("@/lib/types").DealRosterEntry[];
  designatedAgency?: import("@/lib/types").DesignatedAgencyView | null;
  brokerage?: {
    legalName: string;
    licenseNumber: string;
    brokerOfRecordName: string;
    brokerOfRecordLicense: string;
    listingTermDays: number;
    protectionDays: number;
    placeholder: boolean;
  };
  setHydrated: (value: boolean) => void;
  applySnapshot: (snap: AppSnapshot) => void;
  reset: () => void;
  setRole: (role: Role) => void;
  signIn: (email: string, role: Role) => void;
  signOut: () => void | Promise<void>;
  verifyId: () => void | Promise<void>;
  verifyOwnership: () => void | Promise<void>;
  toggleSaved: (listingId: string) => void;
  saveSearch: (filters: SearchFilters) => void;
  saveBuyingPower: (inputs: BuyingPowerInputs) => void | Promise<BuyingPowerProfile | null>;
  submitOffer: (draft: OfferDraft) => Offer | Promise<Offer>;
  acceptOffer: (offerId: string) => void | Promise<void>;
  counterOffer: (
    offerId: string,
    changes: Partial<Pick<Offer, "price" | "closeDate" | "emd">>,
  ) => void | Promise<void>;
  declineOffer: (offerId: string, note?: string) => void | Promise<void>;
  markOfferViewed: (offerId: string) => void | Promise<void>;
  requestOfferExtension: (offerId: string) => void | Promise<void>;
  bookVendor: (vendorId: string, date: string, time: string) => void | Promise<void>;
  dismissConcierge: (category: import("@/lib/types").ConciergeCategory) => void;
  bookOwnInspector: (
    name: string,
    contact: string,
    date: string,
    time: string,
  ) => void | Promise<void>;
  selectServiceProvider: (
    category: import("@/lib/types").VendorCategory,
    vendorId: string,
  ) => void;
  saveOwnProvider: (
    category: import("@/lib/types").VendorCategory,
    input: import("@/lib/types").OwnProviderDetails,
  ) => void;
  completeServiceCategory: (
    category: import("@/lib/types").VendorCategory,
    outcome: string,
  ) => void;
  sendMessage: (threadId: string, body: string) => void | Promise<void>;
  appendCannedReply: (threadId: string) => void;
  markThreadRead: (threadId: string) => void;
  uploadDocument: (name: string, group: DemoState["documents"][number]["group"]) => void | Promise<void>;
  updateListing: (id: string, patch: Partial<Listing>) => void | Promise<void>;
  reorderPhotos: (id: string, photos: string[]) => void | Promise<void>;
  toggleBuyerAgentFee: (listingId: string, on: boolean) => void | Promise<void>;
  addDraftListing: (listing: Listing) => void;
  publishListing: (id: string) => void | Promise<void>;
  withdrawListing: (id: string) => void | Promise<void>;
  uploadListingMedia: (id: string, files: File[]) => void | Promise<void>;
  deleteListingMedia: (id: string, url: string) => void | Promise<void>;
  markInspectionReviewed: () => void | Promise<void>;
  uploadPreApproval: () => void | Promise<void>;
  setDealState: (state: DealState) => void;
  markContractExecuted: () => Promise<void>;
  confirmDeposit: () => Promise<void>;
  beginDiligence: () => Promise<void>;
  advanceClearToClose: () => Promise<void>;
  markClosed: () => Promise<void>;
  markFellThrough: (reason: string) => Promise<void>;
}
