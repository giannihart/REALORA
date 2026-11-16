"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { createSeedState, DEMO_LISTING_ID, vendors } from "@/data/seed";
import { stateAfterAccept } from "@/lib/deal-machine";
import { scoreOffer } from "@/lib/scoring";
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

export interface DemoStore extends DemoState {
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  reset: () => void;
  setRole: (role: Role) => void;
  signIn: (email: string, role: Role) => void;
  signOut: () => void;
  verifyId: () => void;
  verifyOwnership: () => void;
  toggleSaved: (listingId: string) => void;
  saveSearch: (filters: SearchFilters) => void;
  saveBuyingPower: (inputs: BuyingPowerInputs) => BuyingPowerProfile;
  submitOffer: (draft: OfferDraft) => Offer;
  acceptOffer: (offerId: string) => void;
  counterOffer: (
    offerId: string,
    changes: Partial<Pick<Offer, "price" | "closeDate" | "emd">>,
  ) => void;
  declineOffer: (offerId: string, note?: string) => void;
  markOfferViewed: (offerId: string) => void;
  requestOfferExtension: (offerId: string) => void;
  bookVendor: (vendorId: string, date: string, time: string) => void;
  dismissConcierge: (category: import("@/lib/types").ConciergeCategory) => void;
  bookOwnInspector: (name: string, contact: string, date: string, time: string) => void;
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
  sendMessage: (threadId: string, body: string) => void;
  appendCannedReply: (threadId: string) => void;
  markThreadRead: (threadId: string) => void;
  uploadDocument: (name: string, group: DemoState["documents"][number]["group"]) => void;
  updateListing: (id: string, patch: Partial<Listing>) => void;
  reorderPhotos: (id: string, photos: string[]) => void;
  toggleBuyerAgentFee: (listingId: string, on: boolean) => void;
  addDraftListing: (listing: Listing) => void;
  markInspectionReviewed: () => void;
  uploadPreApproval: () => void;
  setDealState: (state: DealState) => void;
}

const REPLIES: Record<string, string> = {
  "thread-seller":
    "We'll share this with the seller and follow up with timing.",
  "thread-inspector":
    "Inspection window is Thursday. I'll upload the report to Documents after the visit.",
  "thread-title":
    "Title search is in progress. We'll flag any exceptions as they appear. Escrow, when opened, sits with the seller's attorney.",
  "thread-buyer":
    "Noted — we'll keep this with the offer file so the seller can weigh it with the other terms.",
  "thread-photo":
    "If you want a restage or a twilight reshoot, send a date and we'll put it on the calendar.",
};

let offerSerial = 4;
let bookingSerial = 1;
let docSerial = 20;
let msgSerial = 40;

const PERSIST_KEY = "realora-demo";
let lastSerialized = "";
let writeSeq = 0;
let writeTimer: ReturnType<typeof setTimeout> | undefined;

function payloadFingerprint(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { writeSeq?: number; state?: unknown };
    return JSON.stringify(parsed.state ?? parsed);
  } catch {
    return raw;
  }
}

function stampWrite(value: string): string {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    parsed.writeSeq = ++writeSeq;
    return JSON.stringify(parsed);
  } catch {
    return value;
  }
}

const debouncedStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    if (payloadFingerprint(value) === payloadFingerprint(lastSerialized)) return;
    const stamped = stampWrite(value);
    lastSerialized = stamped;
    window.clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      window.localStorage.setItem(name, stamped);
    }, 150);
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(name);
  },
};

export function bindStoreCrossTab(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PERSIST_KEY || e.newValue == null) return;
    if (payloadFingerprint(e.newValue) === payloadFingerprint(lastSerialized)) return;
    lastSerialized = e.newValue;
    void Promise.resolve(useDemoStore.persist.rehydrate());
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export const useDemoStore = create<DemoStore>()(
  persist(
    (set) => ({
      ...createSeedState(),
      hydrated: false,
      setHydrated: (value) => set({ hydrated: value }),
      reset: () => set({ ...createSeedState(), hydrated: true }),
      setRole: (role) =>
        set((s) => ({ user: { ...s.user, role, signedIn: true } })),
      signIn: (email, role) =>
        set((s) => ({
          user: {
            ...s.user,
            signedIn: true,
            email,
            role,
            name: "You",
          },
        })),
      signOut: () =>
        set((s) => ({
          user: { ...s.user, signedIn: false, verifiedId: false },
        })),
      verifyId: () =>
        set((s) => ({ user: { ...s.user, verifiedId: true, signedIn: true } })),
      verifyOwnership: () =>
        set((s) => ({
          user: { ...s.user, verifiedOwnership: true, signedIn: true },
        })),
      toggleSaved: (listingId) =>
        set((s) => ({
          savedListingIds: s.savedListingIds.includes(listingId)
            ? s.savedListingIds.filter((id) => id !== listingId)
            : [...s.savedListingIds, listingId],
        })),
      saveSearch: (filters) => set({ savedSearch: filters }),
      saveBuyingPower: (inputs) => {
        const profile: BuyingPowerProfile = {
          ...inputs,
          updatedAt: new Date().toISOString(),
        };
        set({ buyingPower: profile });
        return profile;
      },
      submitOffer: (draft) => {
        const scored = scoreOffer(draft);
        const offer: Offer = {
          id: `offer-new-${offerSerial++}`,
          listingId: draft.listingId,
          buyerLabel: "You (Buyer)",
          isBuyerPersona: true,
          price: draft.price,
          financing: draft.financing,
          downPercent: draft.downPercent,
          emd: draft.emd,
          closeDate: draft.closeDate,
          expires: "2026-10-28",
          status: "New",
          inspectionContingency: draft.inspectionContingency,
          financingContingency: draft.financingContingency,
          verifiedFunds: draft.verifiedFunds,
          agentAttached: draft.agentAttached ?? false,
          verificationTier:
            draft.verificationTier ??
            (draft.financing === "Cash" && draft.verifiedFunds
              ? "cash_funds_verified"
              : draft.verifiedFunds
                ? "fully_underwritten"
                : "self_reported"),
          concessions: draft.concessions ?? 0,
          note: "",
          certaintyLabel: scored.label,
          score: scored.score,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          offers: [
            ...s.offers.map((o) =>
              o.isBuyerPersona ? { ...o, isBuyerPersona: false, buyerLabel: o.buyerLabel } : o,
            ),
            offer,
          ],
          deal: {
            ...s.deal,
            state: "TOURS_OFFERS",
            acceptedOfferId: null,
          },
        }));
        return offer;
      },
      acceptOffer: (offerId) =>
        set((s) => ({
          offers: s.offers.map((o) => {
            if (o.listingId !== s.deal.listingId) return o;
            if (o.id === offerId) return { ...o, status: "Accepted" };
            if (o.status === "New" || o.status === "Viewed" || o.status === "Countered") {
              return { ...o, status: "Declined" };
            }
            return o;
          }),
          deal: {
            ...s.deal,
            acceptedOfferId: offerId,
            state: stateAfterAccept(),
          },
          listings: s.listings.map((l) =>
            l.id === s.deal.listingId ? { ...l, status: "in_contract" } : l,
          ),
        })),
      counterOffer: (offerId, changes) =>
        set((s) => ({
          offers: s.offers.map((o) =>
            o.id === offerId ? { ...o, ...changes, status: "Countered" } : o,
          ),
        })),
      declineOffer: (offerId) =>
        set((s) => {
          const remaining = s.offers.filter(
            (o) =>
              o.listingId === s.deal.listingId &&
              o.id !== offerId &&
              (o.status === "New" || o.status === "Viewed" || o.status === "Countered"),
          );
          const declinedIsPersona = s.offers.find((o) => o.id === offerId)?.isBuyerPersona;
          return {
            offers: s.offers.map((o) =>
              o.id === offerId ? { ...o, status: "Declined" } : o,
            ),
            deal:
              declinedIsPersona && remaining.length === 0
                ? s.deal
                : s.deal,
          };
        }),
      markOfferViewed: (offerId) =>
        set((s) => ({
          offers: s.offers.map((o) =>
            o.id === offerId && o.status === "New" ? { ...o, status: "Viewed" } : o,
          ),
        })),
      requestOfferExtension: (_offerId) => {
        // Local demo: UI toasts; supabase mode creates the AE coordination task.
      },
      bookVendor: (vendorId, date, time) =>
        set((s) => {
          const ownMatch = /^own:(.+)$/.exec(vendorId);
          const vendor = vendors.find((v) => v.id === vendorId);
          const category =
            vendor?.category ??
            (ownMatch?.[1] as import("@/lib/types").VendorCategory | undefined) ??
            (vendorId === "own-inspector" ? "Inspector" : undefined);
          const inspection = category === "Inspector";
          const isOwn = Boolean(ownMatch) || vendorId === "own-inspector";
          return {
            bookings: [
              ...s.bookings.filter((b) => {
                if (!category) return true;
                const ids = new Set(
                  vendors.filter((v) => v.category === category).map((v) => v.id),
                );
                return (
                  !ids.has(b.vendorId) &&
                  b.vendorId !== `own:${category}` &&
                  b.vendorId !== "own-inspector"
                );
              }),
              {
                id: `bk-${bookingSerial++}`,
                vendorId: isOwn && category === "Inspector" ? "own-inspector" : vendorId,
                date,
                time,
                createdAt: new Date().toISOString(),
              },
            ],
            deal: {
              ...s.deal,
              ...(inspection ? { inspectionBooked: true } : {}),
              ...(inspection && !isOwn ? { ownInspector: null } : {}),
              ...(category
                ? {
                    serviceSelections: {
                      ...s.deal.serviceSelections,
                      [category]: isOwn ? "own" : vendorId,
                    },
                  }
                : {}),
            },
            threads: s.threads.map((t) =>
              inspection && t.id === "thread-inspector" ? { ...t, unread: t.unread + 1 } : t,
            ),
            messages: inspection
              ? [
                  ...s.messages,
                  {
                    id: `msg-${msgSerial++}`,
                    threadId: "thread-inspector",
                    sender: isOwn
                      ? "Realora"
                      : vendor?.name ?? "Inspector",
                    body: isOwn
                      ? `We'll coordinate for ${date} at ${time}. No platform payment — they bill you directly.`
                      : `Booked for ${date} at ${time}. I'll meet you at the property and upload the report to Documents after the visit.`,
                    at: new Date().toISOString().slice(0, 16).replace("T", " "),
                    fromUser: false,
                  },
                ]
              : s.messages,
          };
        }),
      dismissConcierge: (category) =>
        set((s) => ({
          deal: {
            ...s.deal,
            dismissedConcierge: [
              ...new Set([...(s.deal.dismissedConcierge ?? []), category]),
            ],
          },
        })),
      bookOwnInspector: (name, contact, date, time) =>
        set((s) => ({
          bookings: [
            ...s.bookings,
            {
              id: `bk-${bookingSerial++}`,
              vendorId: "own-inspector",
              date,
              time,
              createdAt: new Date().toISOString(),
            },
          ],
          deal: {
            ...s.deal,
            inspectionBooked: true,
            ownInspector: { name, contact },
            serviceSelections: { ...s.deal.serviceSelections, Inspector: "own" },
            ownProviders: {
              ...s.deal.ownProviders,
              Inspector: { name, contact },
            },
          },
          messages: [
            ...s.messages,
            {
              id: `msg-${msgSerial++}`,
              threadId: "thread-inspector",
              sender: "Realora",
              body: `We'll coordinate with ${name} (${contact}) for ${date} at ${time}. No platform payment — they bill you directly.`,
              at: new Date().toISOString().slice(0, 16).replace("T", " "),
              fromUser: false,
            },
          ],
        })),
      selectServiceProvider: (category, vendorId) =>
        set((s) => {
          const ownProviders = { ...s.deal.ownProviders };
          delete ownProviders[category];
          return {
            deal: {
              ...s.deal,
              serviceSelections: {
                ...s.deal.serviceSelections,
                [category]: vendorId,
              },
              ownProviders,
              ...(category === "Inspector" ? { ownInspector: null } : {}),
            },
          };
        }),
      saveOwnProvider: (category, input) =>
        set((s) => ({
          deal: {
            ...s.deal,
            serviceSelections: {
              ...s.deal.serviceSelections,
              [category]: "own",
            },
            ownProviders: {
              ...s.deal.ownProviders,
              [category]: input,
            },
            ...(category === "Inspector" ? { ownInspector: input } : {}),
          },
        })),
      completeServiceCategory: (category, outcome) =>
        set((s) => ({
          deal: {
            ...s.deal,
            serviceCompleted: {
              ...s.deal.serviceCompleted,
              [category]: { at: new Date().toISOString(), outcome },
            },
            ...(category === "Inspector" ? { inspectionReportReviewed: true } : {}),
          },
        })),
      sendMessage: (threadId, body) =>
        set((s) => ({
          messages: [
            ...s.messages,
            {
              id: `msg-${msgSerial++}`,
              threadId,
              sender: s.user.role === "buyer" ? "You (Buyer)" : "You (Seller)",
              body,
              at: new Date().toISOString().slice(0, 16).replace("T", " "),
              fromUser: true,
            },
          ],
          threads: s.threads.map((t) =>
            t.id === threadId ? { ...t, preview: body } : t,
          ),
        })),
      appendCannedReply: (threadId) =>
        set((s) => ({
          messages: [
            ...s.messages,
            {
              id: `msg-${msgSerial++}`,
              threadId,
              sender:
                s.threads.find((t) => t.id === threadId)?.name.replace(/ \(via Realora\)/, "") ??
                "Realora",
              body: REPLIES[threadId] ?? "Noted — we'll take it from here.",
              at: new Date().toISOString().slice(0, 16).replace("T", " "),
              fromUser: false,
            },
          ],
          threads: s.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  unread: t.unread + 1,
                  preview: REPLIES[threadId] ?? "Noted — we'll take it from here.",
                }
              : t,
          ),
        })),
      markThreadRead: (threadId) =>
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === threadId ? { ...t, unread: 0 } : t,
          ),
        })),
      uploadDocument: (name, group) =>
        set((s) => ({
          documents: [
            {
              id: `doc-${docSerial++}`,
              name,
              group,
              uploadedBy: s.user.role === "buyer" ? "You (Buyer)" : "You (Seller)",
              date: "2026-10-20",
              status: "Pending",
              role: s.user.role,
              body: `${name.toUpperCase()}\n\nUploaded to the deal vault. Not a legal record until filed.`,
            },
            ...s.documents,
          ],
        })),
      updateListing: (id, patch) =>
        set((s) => ({
          listings: s.listings.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),
      reorderPhotos: (id, photos) =>
        set((s) => ({
          listings: s.listings.map((l) => (l.id === id ? { ...l, photos } : l)),
        })),
      toggleBuyerAgentFee: (listingId, on) =>
        set((s) => ({
          listings: s.listings.map((l) =>
            l.id === listingId ? { ...l, offerBuyerAgentPercent: on ? 1 : 0 } : l,
          ),
        })),
      addDraftListing: (listing) =>
        set((s) => ({ listings: [listing, ...s.listings] })),
      markInspectionReviewed: () =>
        set((s) => ({ deal: { ...s.deal, inspectionReportReviewed: true } })),
      // Buyer cannot self-attest verification — uploads go through the vault; AE confirms.
      uploadPreApproval: () => undefined,
      setDealState: (state) => set((s) => ({ deal: { ...s.deal, state } })),
    }),
    {
      name: PERSIST_KEY,
      version: 2,
      skipHydration: true,
      storage: createJSONStorage(() => debouncedStorage),
      migrate: (persisted) => {
        const state = (persisted ?? {}) as DemoState;
        const fresh = createSeedState();
        const nonDemo = (state.offers ?? []).filter((o) => o.listingId !== DEMO_LISTING_ID);
        return {
          ...state,
          offers: [...fresh.offers, ...nonDemo],
        } as DemoState;
      },
      partialize: (s) => {
        const { hydrated, ...rest } = s;
        void hydrated;
        const actions = [
          "setHydrated",
          "reset",
          "setRole",
          "signIn",
          "signOut",
          "verifyId",
          "verifyOwnership",
          "toggleSaved",
          "saveSearch",
          "saveBuyingPower",
          "submitOffer",
          "acceptOffer",
          "counterOffer",
          "declineOffer",
          "bookVendor",
          "dismissConcierge",
          "bookOwnInspector",
          "selectServiceProvider",
          "saveOwnProvider",
          "completeServiceCategory",
          "sendMessage",
          "appendCannedReply",
          "markThreadRead",
          "uploadDocument",
          "updateListing",
          "reorderPhotos",
          "toggleBuyerAgentFee",
          "addDraftListing",
          "markInspectionReviewed",
          "uploadPreApproval",
          "setDealState",
        ];
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (!actions.includes(k) && typeof v !== "function") data[k] = v;
        }
        return data as unknown as DemoState;
      },
    },
  ),
);

export function filterListings(
  listings: Listing[],
  filters: SearchFilters,
): Listing[] {
  const loc = filters.location.trim().toLowerCase();
  const citywide =
    loc === "" || loc === "new york" || loc === "new york, ny" || loc === "nyc";
  return listings.filter((l) => {
    if (!l.marketplace || l.status === "draft") return false;
    if (!citywide) {
      const hay =
        `${l.address} ${l.neighborhood} ${l.borough} ${l.city} ${l.state}`.toLowerCase();
      if (!hay.includes(loc)) return false;
    }
    if (filters.minPrice && l.price < filters.minPrice) return false;
    if (filters.maxPrice && l.price > filters.maxPrice) return false;
    if (filters.minBeds && l.beds < filters.minBeds) return false;
    if (filters.minBaths && l.baths < filters.minBaths) return false;
    if (filters.homeType && filters.homeType !== "Any" && l.type !== filters.homeType) {
      return false;
    }
    return true;
  });
}

export function getListing(listings: Listing[], id: string): Listing | undefined {
  return listings.find((l) => l.id === id);
}
