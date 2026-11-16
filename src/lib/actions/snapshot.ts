"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { wrapError, type ActionResult } from "@/lib/actions/errors";
import {
  bookingsFromPayload,
  dealFromRows,
  documentsFromRows,
  listingFromRows,
  offerFromRow,
  payloadSlug,
  portalRoleFromParties,
  canSwitchRoles,
  threadsFromMessages,
  toursFromPayload,
} from "@/lib/data/map";
import type {
  AssignmentItem,
  DealRosterEntry,
  DemoState,
  DesignatedAgencyView,
  PartyDeal,
  Role,
  ServiceVendor,
  UserSession,
  VendorCategory,
} from "@/lib/types";
import type { Tables } from "@/lib/database.types";
import { personaConfigured } from "@/lib/site";
import { vendors as seedVendors } from "@/data/seed";
import { loadBrokerageIdentity, type BrokerageIdentity } from "@/lib/compliance/identity";
import { mocksAllowed } from "@/lib/data/mode";
import {
  assignedAgents,
  designatedConsentsSigned,
  isBothSidesOpportunity,
  isDesignatedConsentDoc,
  latestDesignatedAgencyApproval,
} from "@/lib/compliance/gates";
import { financingPathFromPrefs } from "@/lib/buyer-prefs";
import { isIdApproved } from "@/lib/services/verification-persona";
import type { Json } from "@/lib/database.types";

export type AppSnapshot = DemoState & {
  dealId: string | null;
  listingUuid: string | null;
  isBroker: boolean;
  canSwitchRoles: boolean;
  appRole: Tables<"profiles">["app_role"];
  partyRoles: Tables<"deal_parties">["role"][];
  assignments: AssignmentItem[];
  vendors: ServiceVendor[];
  verificationMode: "persona" | "test" | "unavailable";
  myDeals: PartyDeal[];
  brokerage: BrokerageIdentity;
  dealRoster: DealRosterEntry[];
  designatedAgency: DesignatedAgencyView | null;
};

const EMPTY_DEAL: DemoState["deal"] = {
  listingId: "",
  state: "TOURS_OFFERS",
  inspectionBooked: false,
  inspectionReportReviewed: false,
  acceptedOfferId: null,
  preApprovalUploaded: false,
  dismissedConcierge: [],
  ownInspector: null,
};

function emptySnapshot(listings: DemoState["listings"]): AppSnapshot {
  return {
    listings,
    offers: [],
    deal: EMPTY_DEAL,
    savedListingIds: [],
    bookings: [],
    documents: [],
    messages: [],
    threads: [],
    tours: [],
    user: {
      signedIn: false,
      role: "buyer",
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
    savedSearch: null,
    buyingPower: null,
    dealId: null,
    listingUuid: null,
    isBroker: false,
    canSwitchRoles: false,
    appRole: "user",
    partyRoles: [],
    assignments: [],
    vendors: seedVendors,
    verificationMode: "test",
    myDeals: [],
    brokerage: {
      legalName: "REALORA (placeholder)",
      licenseNumber: "PENDING",
      brokerOfRecordName: "REALORA (placeholder)",
      brokerOfRecordLicense: "PENDING",
      listingTermDays: 180,
      protectionDays: 90,
      placeholder: true,
    },
    dealRoster: [],
    designatedAgency: null,
  };
}

function asPayloadRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function savedListingSlugsForUser(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<string[]> {
  const { data: mine, error } = await admin
    .from("saved_homes")
    .select("listing_id")
    .eq("user_id", userId);
  if (error) return [];
  const uuids = [...new Set((mine ?? []).map((r) => r.listing_id))];
  if (!uuids.length) return [];
  const { data: listingRows } = await admin
    .from("listings")
    .select("id, property_id")
    .in("id", uuids);
  const propertyIds = [...new Set((listingRows ?? []).map((l) => l.property_id))];
  const { data: properties } = propertyIds.length
    ? await admin.from("properties").select("id, acris_payload").in("id", propertyIds)
    : { data: [] as Pick<Tables<"properties">, "id" | "acris_payload">[] };
  const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));
  return (listingRows ?? []).map((row) => {
    const property = propertyById.get(row.property_id);
    const extra = asPayloadRecord(property?.acris_payload ?? null);
    return typeof extra.slug === "string" ? extra.slug : row.id;
  });
}

const VENDOR_CATEGORIES: VendorCategory[] = [
  "Inspector",
  "Photographer",
  "Movers",
  "Cleaners",
  "Locksmith",
  "Expediter",
];

function vendorFromRow(row: Tables<"vendors">): ServiceVendor {
  const details =
    row.details && typeof row.details === "object" && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : {};
  const categoryRaw = typeof details.category === "string" ? details.category : row.services[0] ?? "Inspector";
  const category = VENDOR_CATEGORIES.includes(categoryRaw as VendorCategory)
    ? (categoryRaw as VendorCategory)
    : "Inspector";
  const slug = typeof details.slug === "string" ? details.slug : row.id;
  const seed = seedVendors.find((v) => v.id === slug);
  const ready = Boolean(row.stripe_connect_id && row.charges_enabled);
  const tierRaw = typeof details.tier === "string" ? details.tier : seed?.tier;
  const tier =
    tierRaw === "assigned" || tierRaw === "curated" || tierRaw === "concierge"
      ? tierRaw
      : seed?.tier ?? "curated";
  return {
    id: slug,
    name: row.business_name,
    category,
    price: typeof details.price === "number" ? details.price : seed?.price ?? 0,
    rating: typeof details.rating === "number" ? details.rating : seed?.rating ?? 0,
    reviews: typeof details.reviews === "number" ? details.reviews : seed?.reviews ?? 0,
    blurb: typeof details.blurb === "string" ? details.blurb : seed?.blurb ?? "",
    tier,
    recommended:
      typeof details.recommended === "boolean" ? details.recommended : Boolean(seed?.recommended),
    stripeReady: ready,
    setupRequired: !ready,
  };
}

export async function getSnapshotAction(): Promise<ActionResult<AppSnapshot>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: listingRows } = await supabase.from("listings").select("*");
    const propertyIds = [...new Set((listingRows ?? []).map((l) => l.property_id))];
    const { data: propertyRows } = propertyIds.length
      ? await supabase.from("properties").select("*").in("id", propertyIds)
      : { data: [] as Tables<"properties">[] };
    const propertyById = new Map((propertyRows ?? []).map((p) => [p.id, p]));
    const listings = (listingRows ?? [])
      .map((l) => {
        const p = propertyById.get(l.property_id);
        return p ? listingFromRows(l, p) : null;
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    if (!user) {
      const admin = createServiceRoleClient();
      const snap = emptySnapshot(listings);
      snap.brokerage = await loadBrokerageIdentity(admin);
      return { ok: true, data: snap };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    const { data: verification } = await supabase
      .from("verifications")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const admin = createServiceRoleClient();
    const { data: myParties } = await admin
      .from("deal_parties")
      .select("*")
      .eq("user_id", user.id);
    const dealIds = [...new Set((myParties ?? []).map((p) => p.deal_id))];
    const { data: deals } = dealIds.length
      ? await supabase.from("deals").select("*").in("id", dealIds)
      : { data: [] as Tables<"deals">[] };

    function isBuyerPrepDeal(d: Tables<"deals">) {
      const listing = (listingRows ?? []).find((l) => l.id === d.listing_id);
      const property = listing ? propertyById.get(listing.property_id) : null;
      const payload = asPayloadRecord(property?.acris_payload ?? null);
      const slug = payloadSlug(property?.acris_payload ?? null) ?? "";
      return payload.buyerPrep === true || slug.startsWith("buyer-prep-");
    }
    const transactionDeals = (deals ?? []).filter((d) => !isBuyerPrepDeal(d));
    const demoDeal =
      transactionDeals.find((d) => {
        const listing = (listingRows ?? []).find((l) => l.id === d.listing_id);
        const property = listing ? propertyById.get(listing.property_id) : null;
        return payloadSlug(property?.acris_payload ?? null) === "412-2nd-street";
      }) ??
      transactionDeals[0] ??
      null;

    const listingRow = demoDeal
      ? (listingRows ?? []).find((l) => l.id === demoDeal.listing_id)
      : null;
    const property = listingRow ? propertyById.get(listingRow.property_id) : null;
    const listingSlug = property
      ? (payloadSlug(property.acris_payload) ?? listingRow?.id ?? "")
      : "";

    const { data: offerRows } = dealIds.length
      ? await supabase.from("offers").select("*").in("deal_id", dealIds)
      : { data: [] as Tables<"offers">[] };
    const { data: taskRows } = dealIds.length
      ? await supabase.from("tasks").select("*").in("deal_id", dealIds)
      : { data: [] as Tables<"tasks">[] };
    const { data: dealDocumentRows } = dealIds.length
      ? await supabase
          .from("documents")
          .select("*")
          .in("deal_id", dealIds)
          .neq("status", "deleted")
      : { data: [] as Tables<"documents">[] };
    const { data: prepDocumentRows } = await admin
      .from("documents")
      .select("*")
      .eq("uploader_id", user.id)
      .is("deal_id", null)
      .neq("status", "deleted");
    const documentRows = [
      ...(dealDocumentRows ?? []),
      ...(prepDocumentRows ?? []).filter(
        (row) => !(dealDocumentRows ?? []).some((d) => d.id === row.id),
      ),
    ];
    const { data: messageRows } = demoDeal
      ? await supabase.from("messages").select("*").eq("deal_id", demoDeal.id).order("created_at")
      : { data: [] as Tables<"messages">[] };

    const senderIds = [
      ...new Set((messageRows ?? []).map((m) => m.sender_id).filter(Boolean)),
    ] as string[];
    const { data: senderProfiles } = senderIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", senderIds)
      : { data: [] as Pick<Tables<"profiles">, "id" | "full_name" | "email">[] };

    const intent = profile?.intent ?? null;
    const partiesForDeal = (myParties ?? []).filter((p) => p.deal_id === demoDeal?.id);
    const role: Role = portalRoleFromParties(partiesForDeal, intent);
    const userSession: UserSession = {
      signedIn: true,
      role,
      email: profile?.email ?? user.email ?? "",
      name: profile?.full_name ?? "You",
      verifiedId: isIdApproved(verification?.id_status),
      verifiedOwnership: (verification?.tier ?? 0) >= 3,
      id: user.id,
      fundsStatus: verification?.funds_status ?? "pending",
      preapprovalStatus: verification?.preapproval_status ?? "pending",
      approvedAmount:
        verification?.approved_amount_cents != null
          ? Math.round(verification.approved_amount_cents / 100)
          : null,
      preapprovalLenderName: verification?.lender_name ?? null,
      preapprovalConfirmedAt: verification?.preapproval_confirmed_at ?? null,
      financingPath: financingPathFromPrefs(profile?.notification_prefs ?? null),
    };

    const accepted = (offerRows ?? []).find((o) => o.status === "accepted");
    const extra = (property?.acris_payload &&
    typeof property.acris_payload === "object" &&
    !Array.isArray(property.acris_payload)
      ? (property.acris_payload as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    const listingSlugByDealId = new Map<string, string>();
    for (const d of deals ?? []) {
      const l = (listingRows ?? []).find((row) => row.id === d.listing_id);
      const p = l ? propertyById.get(l.property_id) : null;
      listingSlugByDealId.set(d.id, p ? (payloadSlug(p.acris_payload) ?? l?.id ?? "") : "");
    }
    const offers = (offerRows ?? []).map((o) =>
      offerFromRow(o, listingSlugByDealId.get(o.deal_id) ?? listingSlug, user.id),
    );
    const acceptedSlug = accepted
      ? (offers.find((o) => {
          const extraC =
            accepted.contingencies &&
            typeof accepted.contingencies === "object" &&
            !Array.isArray(accepted.contingencies)
              ? (accepted.contingencies as Record<string, unknown>)
              : {};
          return o.id === extraC.slug || o.id === accepted.id;
        })?.id ?? null)
      : null;

    const focusedTasks = (taskRows ?? []).filter((t) => t.deal_id === demoDeal?.id);
    const deal = demoDeal
      ? dealFromRows(demoDeal, listingSlug, acceptedSlug, focusedTasks, extra)
      : EMPTY_DEAL;

    const { threads, messages } = threadsFromMessages(
      messageRows ?? [],
      senderProfiles ?? [],
      user.id,
      role,
    );

    const myRoles = new Set((myParties ?? []).map((p) => p.role));
    const { isRetiredSellerChecklistTitle } = await import("@/lib/tasks/intake-checklist");
    const assignments: AssignmentItem[] = (taskRows ?? [])
      .filter((t) => t.status !== "done" && t.status !== "skipped")
      .filter(
        (t) =>
          t.owner_user_id === user.id || (t.owner_role ? myRoles.has(t.owner_role as Tables<"deal_parties">["role"]) : false),
      )
      // Intake prep is Documents + next-step CTAs — not a Mark-done checklist.
      .filter((t) => !(role === "seller" && isRetiredSellerChecklistTitle(t.title ?? "")))
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description ?? "",
        status: t.status,
        due: t.due_date,
        dealId: t.deal_id,
      }));

    const { data: vendorRows } = await supabase.from("vendors").select("*").eq("active", true);
    const vendors = (vendorRows ?? []).length ? (vendorRows ?? []).map(vendorFromRow) : seedVendors;

    const { data: jobRows } = demoDeal
      ? await supabase.from("service_jobs").select("*").eq("deal_id", demoDeal.id)
      : { data: [] as Tables<"service_jobs">[] };
    const vendorById = new Map((vendorRows ?? []).map((v) => [v.id, v]));
    const jobBookings = (jobRows ?? []).map((job) => {
      const v = vendorById.get(job.vendor_id);
      const details =
        v?.details && typeof v.details === "object" && !Array.isArray(v.details)
          ? (v.details as Record<string, unknown>)
          : {};
      const scheduled = job.scheduled_at ? new Date(job.scheduled_at) : null;
      return {
        id: job.id,
        vendorId: typeof details.slug === "string" ? details.slug : job.vendor_id,
        date: scheduled ? scheduled.toISOString().slice(0, 10) : "",
        time: scheduled
          ? `${String(scheduled.getHours()).padStart(2, "0")}:${String(scheduled.getMinutes()).padStart(2, "0")}`
          : "",
        createdAt: job.created_at,
      };
    });

    const myDeals: PartyDeal[] = (deals ?? []).map((d) => {
      const l = (listingRows ?? []).find((row) => row.id === d.listing_id);
      const p = l ? propertyById.get(l.property_id) : null;
      const role = (myParties ?? []).find((party) => party.deal_id === d.id)?.role ?? "";
      return {
        id: d.id,
        address: p?.address_line ?? "Deal",
        state: d.state,
        role,
      };
    });

    let dealRoster: DealRosterEntry[] = [];
    let designatedAgency: DesignatedAgencyView | null = null;
    if (demoDeal) {
      const { data: allParties } = await admin
        .from("deal_parties")
        .select("*")
        .eq("deal_id", demoDeal.id);
      const partyUserIds = [...new Set((allParties ?? []).map((p) => p.user_id))];
      const { data: partyProfiles } = partyUserIds.length
        ? await admin.from("profiles").select("id, full_name, email").in("id", partyUserIds)
        : { data: [] as Pick<Tables<"profiles">, "id" | "full_name" | "email">[] };
      const profileById = new Map((partyProfiles ?? []).map((p) => [p.id, p]));
      const partyRows: DealRosterEntry[] = (allParties ?? []).map((p) => {
        const prof = profileById.get(p.user_id);
        return {
          id: `${p.deal_id}:${p.user_id}:${p.role}`,
          kind: "party" as const,
          name: prof?.full_name || prof?.email || "Party",
          email: prof?.email ?? "",
          role: p.role,
          side: p.side,
        };
      });
      const { data: openInvites } = await admin
        .from("invites")
        .select("*")
        .eq("deal_id", demoDeal.id)
        .is("accepted_at", null);
      const now = Date.now();
      const inviteRows: DealRosterEntry[] = (openInvites ?? [])
        .filter((inv) => new Date(inv.expires_at).getTime() >= now)
        .map((inv) => ({
          id: inv.id,
          kind: "invite" as const,
          name: inv.email,
          email: inv.email,
          role: inv.role,
          side: inv.side,
          inviteEmail: inv.email,
        }));
      dealRoster = [...partyRows, ...inviteRows];

      const focusedOffers = (offerRows ?? []).filter((o) => o.deal_id === demoDeal.id);
      const acceptedOffer =
        focusedOffers.find((o) => o.status === "accepted") ?? focusedOffers[0] ?? null;
      const required = isBothSidesOpportunity(allParties ?? [], acceptedOffer);
      if (required) {
        const consents = await designatedConsentsSigned(admin, demoDeal.id);
        const approval = await latestDesignatedAgencyApproval(admin, demoDeal.id);
        const { agentSeller, agentBuyer } = assignedAgents(approval);
        const agentsAssigned = Boolean(
          agentSeller && agentBuyer && agentSeller !== agentBuyer,
        );
        const mySide = partiesForDeal.some((p) => p.side === "seller")
          ? ("seller" as const)
          : partiesForDeal.some((p) => p.side === "buyer")
            ? ("buyer" as const)
            : null;
        const needsMyAck =
          mySide === "seller"
            ? !consents.seller
            : mySide === "buyer"
              ? !consents.buyer
              : false;
        const dealDocs = (documentRows ?? []).filter((d) => d.deal_id === demoDeal.id);
        const consentDoc =
          (mySide
            ? dealDocs.find((d) => isDesignatedConsentDoc(d, mySide))
            : null) ??
          dealDocs.find((d) => /dual \/ designated agency consent/i.test(d.name)) ??
          consents.sellerDoc ??
          consents.buyerDoc ??
          null;
        designatedAgency = {
          required: true,
          sellerAck: consents.seller,
          buyerAck: consents.buyer,
          agentsAssigned,
          mySide,
          needsMyAck,
          consentDocumentId: consentDoc?.id ?? null,
          consentDocumentName: consentDoc?.name ?? null,
        };
      }
    }

    const savedListingIds = await savedListingSlugsForUser(admin, user.id);

    const snapshot: AppSnapshot = {
      listings,
      offers,
      deal,
      savedListingIds,
      bookings: jobBookings.length
        ? jobBookings
        : property
          ? bookingsFromPayload(property.acris_payload)
          : [],
      documents: documentsFromRows(documentRows),
      messages,
      threads,
      user: userSession,
      savedSearch: null,
      buyingPower: null,
      tours: property ? toursFromPayload(property.acris_payload) : [],
      dealId: demoDeal?.id ?? null,
      listingUuid: listingRow?.id ?? null,
      isBroker: profile?.app_role === "broker" || profile?.app_role === "admin",
      canSwitchRoles: canSwitchRoles(partiesForDeal, intent),
      appRole: profile?.app_role ?? "user",
      partyRoles: partiesForDeal.map((p) => p.role),
      assignments,
      vendors,
      verificationMode: personaConfigured() ? "persona" : mocksAllowed() ? "test" : "unavailable",
      myDeals,
      brokerage: await loadBrokerageIdentity(admin),
      dealRoster,
      designatedAgency,
    };
    return { ok: true, data: snapshot };
  } catch (error) {
    return wrapError(error);
  }
}
