"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { createSeedState, vendors as seedVendors } from "@/data/seed";
import type { AppSnapshot } from "@/lib/actions/snapshot";
import { ActionFailure } from "@/lib/actions/errors";
import {
  acceptOfferAction,
  advanceClearToCloseAction,
  beginDiligenceAction,
  bookVendorAction,
  completeTaskByTitleAction,
  confirmDepositAction,
  counterOfferAction,
  declineOfferAction,
  markClosedAction,
  markContractExecutedAction,
  markFellThroughAction,
  markOfferViewedAction,
  requestOfferExtensionAction,
  sendMessageAction,
  setIntentAction,
  submitOfferAction,
  uploadDocumentAction,
  verifyCurrentUserAction,
} from "@/lib/actions/deal";
import {
  deleteListingMediaAction,
  publishListingAction,
  updateListingAction,
  uploadListingMediaAction,
  withdrawListingAction,
} from "@/lib/actions/listing";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { DataProvider } from "@/lib/data/provider";
import type { ActionResult } from "@/lib/actions/errors";
import type { BuyingPowerInputs } from "@/lib/buying-power";
import type { Offer, OfferDraft } from "@/lib/types";

function apply(
  snap: AppSnapshot,
  savedListingIds: string[],
  savedSearch: DataProvider["savedSearch"],
  buyingPower: DataProvider["buyingPower"],
) {
  return {
    listings: snap.listings,
    offers: snap.offers,
    deal: snap.deal,
    bookings: snap.bookings,
    documents: snap.documents,
    messages: snap.messages,
    threads: snap.threads,
    user: snap.user,
    tours: snap.tours,
    dealId: snap.dealId,
    listingUuid: snap.listingUuid,
    isBroker: snap.isBroker,
    canSwitchRoles: snap.canSwitchRoles,
    appRole: snap.appRole,
    partyRoles: snap.partyRoles ?? [],
    assignments: snap.assignments ?? [],
    vendors: snap.vendors,
    verificationMode: snap.verificationMode,
    myDeals: snap.myDeals ?? [],
    dealRoster: snap.dealRoster ?? [],
    designatedAgency: snap.designatedAgency ?? null,
    brokerage: snap.brokerage,
    // Prefer server saves when present; otherwise keep local (e.g. table not migrated).
    savedListingIds:
      snap.user.signedIn && snap.savedListingIds.length
        ? snap.savedListingIds
        : snap.user.signedIn
          ? savedListingIds.length
            ? savedListingIds
            : snap.savedListingIds
          : savedListingIds,
    savedSearch,
    buyingPower,
  };
}

async function unwrap<T>(result: Promise<ActionResult<T>>): Promise<T> {
  const res = await result;
  if (!res.ok) {
    toast(res.message);
    const err = new ActionFailure(res.code, res.message);
    throw err;
  }
  return res.data;
}

function emptyClientState() {
  return {
    ...createSeedState(),
    listings: [] as DataProvider["listings"],
    offers: [] as DataProvider["offers"],
    documents: [] as DataProvider["documents"],
    messages: [] as DataProvider["messages"],
    threads: [] as DataProvider["threads"],
    tours: [] as DataProvider["tours"],
    bookings: [] as DataProvider["bookings"],
    savedListingIds: [] as string[],
    savedSearch: null as DataProvider["savedSearch"],
    buyingPower: null as DataProvider["buyingPower"],
    deal: {
      listingId: "",
      state: "TOURS_OFFERS" as const,
      inspectionBooked: false,
      inspectionReportReviewed: false,
      acceptedOfferId: null,
      preApprovalUploaded: false,
      dismissedConcierge: [] as NonNullable<DataProvider["deal"]["dismissedConcierge"]>,
      ownInspector: null,
    },
    user: {
      signedIn: false,
      role: "buyer" as const,
      email: "",
      name: "",
      verifiedId: false,
      verifiedOwnership: false,
      fundsStatus: "pending",
      preapprovalStatus: "pending",
      approvedAmount: null,
      preapprovalLenderName: null,
      preapprovalConfirmedAt: null,
      financingPath: null,
    },
    hydrated: false,
    dealId: null as string | null,
    listingUuid: null as string | null,
    isBroker: false,
    canSwitchRoles: false,
    appRole: "user" as const,
    partyRoles: [] as string[],
    assignments: [] as NonNullable<DataProvider["assignments"]>,
    myDeals: [] as NonNullable<DataProvider["myDeals"]>,
    dealRoster: [] as NonNullable<DataProvider["dealRoster"]>,
    designatedAgency: null as DataProvider["designatedAgency"],
    verificationMode: "test" as const,
    vendors: seedVendors,
    brokerage: {
      legalName: "REALORA (placeholder)",
      licenseNumber: "PENDING",
      brokerOfRecordName: "REALORA (placeholder)",
      brokerOfRecordLicense: "PENDING",
      listingTermDays: 180,
      protectionDays: 90,
      placeholder: true,
    },
  };
}

export const useSupabaseAppStore = create<DataProvider>()(
  persist(
    (set, get) => ({
      ...emptyClientState(),
      setHydrated: (value) => set({ hydrated: value }),
      applySnapshot: (snap) =>
        set({
          ...apply(snap, get().savedListingIds, get().savedSearch, get().buyingPower),
          hydrated: true,
        }),
      reset: () => {
        toast("Reset is available in local mode.");
      },
      setRole: (role) => {
        if (!get().canSwitchRoles) return;
        set((s) => ({ user: { ...s.user, role } }));
      },
      signIn: (email, role) => {
        set((s) => ({
          user: { ...s.user, signedIn: true, email, role, name: s.user.name || "You" },
        }));
        void setIntentAction(role === "seller" ? "selling" : "buying");
      },
      signOut: async () => {
        const supabase = createBrowserSupabaseClient();
        await supabase.auth.signOut();
        set({
          ...emptyClientState(),
          hydrated: true,
          vendors: get().vendors,
        });
      },
      verifyId: async () => {
        const snap = await unwrap(verifyCurrentUserAction("id"));
        get().applySnapshot(snap);
      },
      verifyOwnership: async () => {
        const snap = await unwrap(verifyCurrentUserAction("ownership"));
        get().applySnapshot(snap);
      },
      toggleSaved: (listingId) => {
        const prev = get().savedListingIds;
        const optimistic = prev.includes(listingId)
          ? prev.filter((id) => id !== listingId)
          : [...prev, listingId];
        set({ savedListingIds: optimistic });
        void import("@/lib/actions/listing-attention").then(({ toggleSavedListingAction }) =>
          toggleSavedListingAction(listingId).then((result) => {
            if (!result.ok) {
              // Keep optimistic local saves when the saved_homes table isn't migrated yet.
              if (/schema cache|does not exist|Could not find the table/i.test(result.message)) {
                return;
              }
              set({ savedListingIds: prev });
              toast(result.message);
              return;
            }
            set({ savedListingIds: result.data.savedListingIds });
          }),
        );
      },
      saveSearch: (filters) => set({ savedSearch: filters }),
      saveBuyingPower: async (inputs: BuyingPowerInputs) => {
        const profile = {
          ...inputs,
          updatedAt: new Date().toISOString(),
        };
        set({ buyingPower: profile });
        const { saveBuyingPowerAction } = await import("@/lib/actions/buying-power");
        const result = await saveBuyingPowerAction(inputs);
        if (!result.ok) {
          if (result.code === "unauthenticated") return profile;
          toast(result.message);
          throw new ActionFailure(result.code, result.message);
        }
        set({ buyingPower: result.data });
        return result.data;
      },
      submitOffer: async (draft: OfferDraft): Promise<Offer> => {
        const snap = await unwrap(submitOfferAction(draft));
        get().applySnapshot(snap);
        const created = snap.offers[snap.offers.length - 1];
        if (!created) throw new Error("Offer was not created.");
        return created;
      },
      acceptOffer: async (offerId) => {
        const snap = await unwrap(acceptOfferAction(offerId));
        get().applySnapshot(snap);
      },
      counterOffer: async (offerId, changes) => {
        const snap = await unwrap(counterOfferAction(offerId, changes));
        get().applySnapshot(snap);
      },
      declineOffer: async (offerId, note) => {
        const snap = await unwrap(declineOfferAction(offerId, note));
        get().applySnapshot(snap);
      },
      markOfferViewed: async (offerId) => {
        const snap = await unwrap(markOfferViewedAction(offerId));
        get().applySnapshot(snap);
      },
      requestOfferExtension: async (offerId) => {
        const snap = await unwrap(requestOfferExtensionAction(offerId));
        get().applySnapshot(snap);
      },
      bookVendor: async (vendorId, date, time) => {
        // Bring-your-own: coordination only — no Stripe.
        if (vendorId.startsWith("own:") || vendorId === "own-inspector") {
          const category = vendorId.startsWith("own:")
            ? (vendorId.slice(4) as import("@/lib/types").VendorCategory)
            : "Inspector";
          set((s) => ({
            deal: {
              ...s.deal,
              ...(category === "Inspector" ? { inspectionBooked: true } : {}),
              serviceSelections: {
                ...s.deal.serviceSelections,
                [category]: "own",
              },
            },
            bookings: [
              ...s.bookings.filter((b) => b.vendorId !== vendorId && b.vendorId !== "own-inspector"),
              {
                id: `own-${Date.now()}`,
                vendorId: category === "Inspector" ? "own-inspector" : vendorId,
                date,
                time,
                createdAt: new Date().toISOString(),
              },
            ],
          }));
          toast("Scheduled — we'll coordinate.");
          return;
        }
        const { startVendorBookingAction } = await import("@/lib/actions/vendor");
        const started = await startVendorBookingAction(vendorId, date, time);
        if (!started.ok) {
          toast(started.message);
          throw new Error(started.message);
        }
        // Do not applySnapshot when blocked — that would wipe local serviceSelections.
        if (started.data.blocked) {
          toast(started.data.blocked);
          throw new Error(started.data.blocked);
        }
        get().applySnapshot(started.data.snapshot);
        // Reflect selection locally until snapshot remaps.
        set((s) => {
          const live = s.vendors?.length ? s.vendors : seedVendors;
          const vendor = live.find((v) => v.id === vendorId);
          if (!vendor) return s;
          return {
            deal: {
              ...s.deal,
              serviceSelections: {
                ...s.deal.serviceSelections,
                [vendor.category]: vendorId,
              },
            },
          };
        });
        if (started.data.checkoutUrl) {
          window.location.href = started.data.checkoutUrl;
        }
      },
      dismissConcierge: (category) =>
        set((s) => ({
          deal: {
            ...s.deal,
            dismissedConcierge: [
              ...new Set([...(s.deal.dismissedConcierge ?? []), category]),
            ],
          },
        })),
      bookOwnInspector: async (name, contact, date, time) => {
        // Coordination-only path — no Stripe payment.
        set((s) => ({
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
          bookings: [
            ...s.bookings,
            {
              id: `own-${Date.now()}`,
              vendorId: "own-inspector",
              date,
              time,
              createdAt: new Date().toISOString(),
            },
          ],
        }));
        toast(`We'll coordinate with ${name}. No platform payment.`);
      },
      selectServiceProvider: (category, vendorId) => {
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
        });
        void import("@/lib/actions/services").then(({ recordServiceProviderChosenAction }) =>
          recordServiceProviderChosenAction(category, vendorId),
        );
      },
      saveOwnProvider: (category, input) => {
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
        }));
        void import("@/lib/actions/services").then(({ recordOwnProviderAction }) =>
          recordOwnProviderAction(category, input),
        );
      },
      completeServiceCategory: (category, outcome) => {
        set((s) => ({
          deal: {
            ...s.deal,
            serviceCompleted: {
              ...s.deal.serviceCompleted,
              [category]: { at: new Date().toISOString(), outcome },
            },
            ...(category === "Inspector" ? { inspectionReportReviewed: true } : {}),
          },
        }));
        void import("@/lib/actions/services").then(({ recordServiceCompletedAction }) =>
          recordServiceCompletedAction(category, outcome),
        );
      },
      sendMessage: async (threadId, body) => {
        const snap = await unwrap(sendMessageAction(threadId, body));
        get().applySnapshot(snap);
      },
      appendCannedReply: () => {
        // Real messages only in supabase mode.
      },
      markThreadRead: (threadId) =>
        set((s) => ({
          threads: s.threads.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)),
        })),
      uploadDocument: async (name, group) => {
        const snap = await unwrap(uploadDocumentAction(name, group));
        get().applySnapshot(snap);
      },
      updateListing: async (id, patch) => {
        const snap = await unwrap(
          updateListingAction(id, {
            price: patch.price,
            description: patch.about?.[0],
            photos: patch.photos,
            buyerAgentOffered:
              patch.offerBuyerAgentPercent == null
                ? undefined
                : patch.offerBuyerAgentPercent === 1,
            status: patch.status,
            mediaCostCents: patch.mediaCostCents,
            campaignCostCents: patch.campaignCostCents,
            pricingGuidance: patch.pricingGuidance,
          }),
        );
        get().applySnapshot(snap);
      },
      reorderPhotos: async (id, photos) => {
        const snap = await unwrap(updateListingAction(id, { photos }));
        get().applySnapshot(snap);
      },
      toggleBuyerAgentFee: async (listingId, on) => {
        const snap = await unwrap(updateListingAction(listingId, { buyerAgentOffered: on }));
        get().applySnapshot(snap);
      },
      addDraftListing: (listing) =>
        set((s) => ({ listings: [listing, ...s.listings] })),
      publishListing: async (id) => {
        const snap = await unwrap(publishListingAction(id));
        get().applySnapshot(snap);
      },
      withdrawListing: async (id) => {
        const snap = await unwrap(withdrawListingAction(id));
        get().applySnapshot(snap);
      },
      uploadListingMedia: async (id, files) => {
        const form = new FormData();
        for (const file of files) form.append("files", file);
        const snap = await unwrap(uploadListingMediaAction(id, form));
        get().applySnapshot(snap);
      },
      deleteListingMedia: async (id, url) => {
        const snap = await unwrap(deleteListingMediaAction(id, url));
        get().applySnapshot(snap);
      },
      markInspectionReviewed: async () => {
        const snap = await unwrap(completeTaskByTitleAction("Review inspection report"));
        get().applySnapshot(snap);
      },
      // Buyer cannot self-attest verification — uploads go through the vault; AE confirms.
      uploadPreApproval: () => undefined,
      setDealState: (state) => set((s) => ({ deal: { ...s.deal, state } })),
      markContractExecuted: async () => {
        const snap = await unwrap(markContractExecutedAction());
        get().applySnapshot(snap);
      },
      confirmDeposit: async () => {
        const snap = await unwrap(confirmDepositAction());
        get().applySnapshot(snap);
      },
      beginDiligence: async () => {
        const snap = await unwrap(beginDiligenceAction());
        get().applySnapshot(snap);
      },
      advanceClearToClose: async () => {
        const snap = await unwrap(advanceClearToCloseAction());
        get().applySnapshot(snap);
      },
      markClosed: async () => {
        const snap = await unwrap(markClosedAction());
        get().applySnapshot(snap);
      },
      markFellThrough: async (reason) => {
        const snap = await unwrap(markFellThroughAction(reason));
        get().applySnapshot(snap);
      },
    }),
    {
      name: "realora-supabase-prefs",
      skipHydration: true,
      partialize: (s) =>
        ({
          savedListingIds: s.savedListingIds,
          savedSearch: s.savedSearch,
          buyingPower: s.buyingPower,
        }) as unknown as DataProvider,
    },
  ),
);

export async function hydrateSupabaseStore() {
  const { getSnapshotAction } = await import("@/lib/actions/snapshot");
  await Promise.resolve(useSupabaseAppStore.persist.rehydrate());
  const result = await getSnapshotAction();
  if (result.ok) useSupabaseAppStore.getState().applySnapshot(result.data);
  else useSupabaseAppStore.getState().setHydrated(true);
  const { getBuyingPowerAction } = await import("@/lib/actions/buying-power");
  const power = await getBuyingPowerAction();
  if (power.ok && power.data) useSupabaseAppStore.setState({ buyingPower: power.data });
}

export function bindSupabaseRealtime(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const supabase = createBrowserSupabaseClient();
  let poll: ReturnType<typeof setInterval> | undefined;
  let alive = true;

  const refresh = () => {
    void import("@/lib/actions/snapshot").then(({ getSnapshotAction }) =>
      getSnapshotAction().then((result) => {
        if (result.ok) useSupabaseAppStore.getState().applySnapshot(result.data);
      }),
    );
  };

  const dealId = useSupabaseAppStore.getState().dealId;
  const channel = supabase
    .channel(`deal-${dealId ?? "public"}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "offers" }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "milestones" }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)
    .subscribe((status) => {
      if (!alive) return;
      if (status === "SUBSCRIBED") {
        if (poll) clearInterval(poll);
        poll = undefined;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (!poll) poll = setInterval(refresh, 10_000);
      }
    });

  if (!poll) poll = setInterval(refresh, 10_000);

  return () => {
    alive = false;
    if (poll) clearInterval(poll);
    void supabase.removeChannel(channel);
  };
}
