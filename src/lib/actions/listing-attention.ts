"use server";

import {
  hasRole,
  insertEvent,
  insertTaskRows,
  isStaff,
  loadParties,
  requireActor,
  type Actor,
} from "@/lib/actions/actor";
import { DealActionError, fail, wrapError, type ActionResult } from "@/lib/actions/errors";
import { resolveListingRow } from "@/lib/actions/listing";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/lib/database.types";

const AE_ROLES: Tables<"deal_parties">["role"][] = ["agent_seller", "broker_of_record"];

export type ListingAttentionStats = {
  viewsTotal: number;
  views30d: number;
  viewsByDay: { day: string; count: number }[];
  savesCurrent: number;
  saves30d: number;
  publishedAt: string | null;
  daysOnRealora: number | null;
  toursCompleted: number;
  toursUpcoming: number;
  offersCount: number;
  pricingGuidance: string | null;
  agreementSigned: boolean;
  /** Seller signed; brokerage countersign still outstanding. */
  agreementCountersignPending: boolean;
  mediaScheduledLabel: string | null;
  hasPhotos: boolean;
  hasCopy: boolean;
  brokerReviewDone: boolean;
};

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function payloadDay(payload: Json): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const day = (payload as Record<string, unknown>).day;
  return typeof day === "string" ? day : null;
}

function payloadViewerKey(payload: Json): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const key = (payload as Record<string, unknown>).viewer_key;
  return typeof key === "string" ? key : null;
}

async function resolveDealForListing(
  admin: Actor["admin"],
  listingUuid: string,
): Promise<Tables<"deals"> | null> {
  const { data } = await admin
    .from("deals")
    .select("*")
    .eq("listing_id", listingUuid)
    .maybeSingle();
  return data;
}

function isBrokerOrAdmin(profile: Tables<"profiles">): boolean {
  return profile.app_role === "broker" || profile.app_role === "admin";
}

function shouldExcludeViewer(
  actor: { userId: string; profile: Tables<"profiles"> } | null,
  listing: Tables<"listings">,
  parties: Tables<"deal_parties">[],
): boolean {
  if (!actor) return false;
  if (isBrokerOrAdmin(actor.profile)) return true;
  if (listing.seller_id === actor.userId) return true;
  if (hasRole(parties, actor.userId, AE_ROLES)) return true;
  return false;
}

async function optionalViewer(): Promise<{
  userId: string;
  profile: Tables<"profiles">;
} | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createServiceRoleClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;
  return { userId: user.id, profile };
}

/**
 * Record a public listing view. Deduped to one counted view per viewer per listing per day.
 * Seller, AE (agent_seller / broker_of_record on the deal), and broker/admin never count.
 * Anonymous viewers are keyed by the client-supplied viewerKey.
 */
export async function recordListingViewedAction(
  listingId: string,
  viewerKey: string,
): Promise<ActionResult<{ counted: boolean }>> {
  try {
    if (!listingId || !viewerKey?.trim()) {
      return fail("validation", "listingId and viewerKey are required.");
    }
    const admin = createServiceRoleClient();
    const { listing } = await resolveListingRow(admin, listingId);
    if (listing.status !== "live" && listing.status !== "under_contract") {
      return { ok: true, data: { counted: false } };
    }
    const deal = await resolveDealForListing(admin, listing.id);
    if (!deal) return { ok: true, data: { counted: false } };

    const viewer = await optionalViewer();
    const parties = await loadParties(admin, deal.id);
    if (shouldExcludeViewer(viewer, listing, parties)) {
      return { ok: true, data: { counted: false } };
    }

    const day = utcDay();
    const key = viewer?.userId ?? viewerKey.trim();
    const { data: existing } = await admin
      .from("events")
      .select("id, actor_id, payload")
      .eq("deal_id", deal.id)
      .eq("type", "listing.viewed")
      .gte("created_at", `${day}T00:00:00.000Z`)
      .lte("created_at", `${day}T23:59:59.999Z`);

    const already = (existing ?? []).some((ev) => {
      if (viewer?.userId && ev.actor_id === viewer.userId) return true;
      return payloadDay(ev.payload) === day && payloadViewerKey(ev.payload) === key;
    });
    if (already) return { ok: true, data: { counted: false } };

    await insertEvent(admin, deal.id, viewer?.userId ?? null, "listing.viewed", {
      listing_id: listing.id,
      day,
      viewer_key: key,
    });
    return { ok: true, data: { counted: true } };
  } catch (error) {
    return wrapError(error);
  }
}

export async function toggleSavedListingAction(
  listingId: string,
): Promise<ActionResult<{ saved: boolean; savedListingIds: string[] }>> {
  try {
    const actor = await requireActor();
    const { listing } = await resolveListingRow(actor.admin, listingId);
    const deal = await resolveDealForListing(actor.admin, listing.id);

    const { data: existing } = await actor.admin
      .from("saved_homes")
      .select("id")
      .eq("user_id", actor.userId)
      .eq("listing_id", listing.id)
      .maybeSingle();

    if (existing) {
      const { error } = await actor.admin
        .from("saved_homes")
        .delete()
        .eq("user_id", actor.userId)
        .eq("listing_id", listing.id);
      if (error) throw new DealActionError("validation", error.message);
      if (deal) {
        await insertEvent(actor.admin, deal.id, actor.userId, "listing.unsaved", {
          listing_id: listing.id,
        });
      }
    } else {
      const { error } = await actor.admin.from("saved_homes").insert({
        user_id: actor.userId,
        listing_id: listing.id,
      });
      if (error) throw new DealActionError("validation", error.message);
      if (deal) {
        await insertEvent(actor.admin, deal.id, actor.userId, "listing.saved", {
          listing_id: listing.id,
        });
      }
    }

    const { data: mine } = await actor.admin
      .from("saved_homes")
      .select("listing_id")
      .eq("user_id", actor.userId);
    const uuids = (mine ?? []).map((r) => r.listing_id);
    const { data: listingRows } = uuids.length
      ? await actor.admin.from("listings").select("id, property_id").in("id", uuids)
      : { data: [] as Tables<"listings">[] };
    const propertyIds = [...new Set((listingRows ?? []).map((l) => l.property_id))];
    const { data: properties } = propertyIds.length
      ? await actor.admin.from("properties").select("id, acris_payload").in("id", propertyIds)
      : { data: [] as Pick<Tables<"properties">, "id" | "acris_payload">[] };
    const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));
    const publicIds = (listingRows ?? []).map((row) => {
      const property = propertyById.get(row.property_id);
      const extra = asRecord(property?.acris_payload);
      return typeof extra.slug === "string" ? extra.slug : row.id;
    });
    return {
      ok: true,
      data: { saved: !existing, savedListingIds: publicIds },
    };
  } catch (error) {
    return wrapError(error);
  }
}

export async function requestPriceChangeAction(
  listingId: string,
  note: string,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = await requireActor();
    const trimmed = note.trim();
    if (!trimmed) return fail("validation", "Add a short note for your agent.");
    const { listing } = await resolveListingRow(actor.admin, listingId);
    const deal = await resolveDealForListing(actor.admin, listing.id);
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    const parties = await loadParties(actor.admin, deal.id);
    const isSeller =
      listing.seller_id === actor.userId ||
      hasRole(parties, actor.userId, ["seller", "co_seller"]);
    if (!isSeller && !isStaff(actor)) {
      throw new DealActionError("forbidden", "Only the seller may request a price discussion.");
    }
    await insertTaskRows(actor.admin, deal.id, actor.userId, [
      {
        title: "Pricing discussion",
        description: trimmed,
        owner_role: "agent_seller",
        status: "pending",
        auto: false,
      },
    ]);
    await insertEvent(actor.admin, deal.id, actor.userId, "listing.price_discuss", {
      listing_id: listing.id,
      note: trimmed,
    });
    return { ok: true, data: { ok: true } };
  } catch (error) {
    return wrapError(error);
  }
}

export async function getListingAttentionAction(
  listingId: string,
): Promise<ActionResult<ListingAttentionStats>> {
  try {
    const actor = await requireActor();
    const { listing, property } = await resolveListingRow(actor.admin, listingId);
    const deal = await resolveDealForListing(actor.admin, listing.id);
    const parties = deal ? await loadParties(actor.admin, deal.id) : [];
    const canSee =
      listing.seller_id === actor.userId ||
      isStaff(actor) ||
      hasRole(parties, actor.userId, [...AE_ROLES, "seller", "co_seller"]);
    if (!canSee) throw new DealActionError("forbidden", "Not allowed to view listing attention.");

    const extra = asRecord(property.acris_payload);
    const pricingGuidance =
      typeof extra.pricingGuidance === "string" && extra.pricingGuidance.trim()
        ? extra.pricingGuidance.trim()
        : null;

    let viewsTotal = 0;
    let views30d = 0;
    const dayCounts = new Map<string, number>();
    let savesCurrent = 0;
    let saves30d = 0;
    let publishedAt: string | null = null;
    let offersCount = 0;
    let agreementSigned = false;
    let agreementCountersignPending = false;
    let brokerReviewDone = false;
    let toursCompleted = 0;

    const since30 = daysAgoIso(30);
    const today = utcDay();

    if (deal) {
      const { data: events } = await actor.admin
        .from("events")
        .select("type, payload, created_at, actor_id")
        .eq("deal_id", deal.id)
        .in("type", [
          "listing.viewed",
          "listing.saved",
          "listing.published",
          "deal.live",
          "agreement_mock_signed_at",
        ]);

      for (const ev of events ?? []) {
        if (ev.type === "listing.viewed") {
          viewsTotal += 1;
          if (ev.created_at >= since30) views30d += 1;
          const day = payloadDay(ev.payload) ?? ev.created_at.slice(0, 10);
          dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
        }
        if (ev.type === "listing.saved" && ev.created_at >= since30) {
          saves30d += 1;
        }
        if (
          (ev.type === "listing.published" || ev.type === "deal.live") &&
          (!publishedAt || ev.created_at < publishedAt)
        ) {
          publishedAt = ev.created_at;
        }
        if (ev.type === "agreement_mock_signed_at") agreementSigned = true;
      }

      const { count } = await actor.admin
        .from("saved_homes")
        .select("id", { count: "exact", head: true })
        .eq("listing_id", listing.id);
      savesCurrent = count ?? 0;

      const { count: offerCount } = await actor.admin
        .from("offers")
        .select("id", { count: "exact", head: true })
        .eq("deal_id", deal.id);
      offersCount = offerCount ?? 0;

      const { data: agreements } = await actor.admin
        .from("documents")
        .select("id, status, name")
        .eq("deal_id", deal.id)
        .neq("status", "deleted");
      const listingAgreements = (agreements ?? []).filter((d) =>
        /listing agreement/i.test(d.name),
      );
      for (const d of listingAgreements) {
        const s = (d.status ?? "").toLowerCase();
        if (
          s === "signed" ||
          s === "fully executed" ||
          s === "completed" ||
          s === "fully_executed"
        ) {
          agreementSigned = true;
        }
        if (s === "signed") agreementCountersignPending = true;
        if (s === "fully executed" || s === "completed" || s === "fully_executed") {
          agreementCountersignPending = false;
          brokerReviewDone = true;
        }
      }

      const { data: approvals } = await actor.admin
        .from("approvals")
        .select("id, status, kind")
        .eq("deal_id", deal.id)
        .in("kind", ["listing_publish", "listing_agreement_countersign"]);
      if ((approvals ?? []).some((a) => a.kind === "listing_publish" && a.status === "approved")) {
        brokerReviewDone = true;
      }
      if (
        (approvals ?? []).some(
          (a) => a.kind === "listing_agreement_countersign" && a.status === "approved",
        )
      ) {
        brokerReviewDone = true;
        agreementCountersignPending = false;
      }

      const tours = Array.isArray(extra.tours) ? (extra.tours as unknown[]) : [];
      toursCompleted = tours.length;
    }

    const viewsByDay: { day: string; count: number }[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(`${today}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      viewsByDay.push({ day: key, count: dayCounts.get(key) ?? 0 });
    }

    if (!publishedAt && listing.status !== "draft") {
      const syndication = Array.isArray(extra.syndication)
        ? (extra.syndication as { at?: string }[])
        : [];
      const syndAt = syndication
        .map((s) => (typeof s.at === "string" ? s.at.slice(0, 10) : null))
        .filter((d): d is string => Boolean(d && d !== "—"))
        .sort()[0];
      publishedAt = syndAt ? `${syndAt}T00:00:00.000Z` : listing.created_at;
    }

    let daysOnRealora: number | null = null;
    if (listing.status !== "draft" && publishedAt) {
      const a = new Date(publishedAt.slice(0, 10) + "T00:00:00.000Z").getTime();
      const b = new Date(`${today}T00:00:00.000Z`).getTime();
      daysOnRealora = Math.max(0, Math.round((b - a) / 86_400_000));
    } else if (listing.status !== "draft") {
      daysOnRealora = 0;
    }

    const media = Array.isArray(listing.media) ? listing.media : [];
    const hasPhotos = media.some((item) => {
      if (!item || typeof item !== "object") return false;
      const url = "url" in item ? (item as { url?: unknown }).url : null;
      return typeof url === "string" && url.length > 0;
    });
    const hasCopy = Boolean(
      (listing.description && listing.description.trim()) ||
        (Array.isArray(extra.about) &&
          (extra.about as string[]).some((p) => typeof p === "string" && p.trim())),
    );

    const stagingLabels = Array.isArray(extra.stagingLabels)
      ? (extra.stagingLabels as string[])
      : [];
    const mediaScheduledLabel =
      stagingLabels.find((l) => /media scheduled/i.test(l)) ??
      (typeof extra.mediaDate === "string" ? extra.mediaDate : null);

    return {
      ok: true,
      data: {
        viewsTotal,
        views30d,
        viewsByDay,
        savesCurrent,
        saves30d,
        publishedAt,
        daysOnRealora,
        toursCompleted,
        toursUpcoming: 0,
        offersCount,
        pricingGuidance,
        agreementSigned,
        agreementCountersignPending,
        mediaScheduledLabel,
        hasPhotos,
        hasCopy,
        brokerReviewDone,
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}

/** Public-safe counts only — no party, offer, or guidance fields. */
export type PublicListingAttention = {
  viewsTotal: number;
  views30d: number;
  savesCurrent: number;
  saves30d: number;
};

/**
 * Read view/save counts for a public listing page.
 * Does not require auth and returns only aggregate numbers.
 */
export async function getPublicListingAttentionAction(
  listingId: string,
): Promise<ActionResult<PublicListingAttention>> {
  try {
    if (!listingId) return fail("validation", "listingId is required.");
    const admin = createServiceRoleClient();
    const { listing } = await resolveListingRow(admin, listingId);
    const deal = await resolveDealForListing(admin, listing.id);

    let viewsTotal = 0;
    let views30d = 0;
    let saves30d = 0;
    const since30 = daysAgoIso(30);

    if (deal) {
      const { data: events } = await admin
        .from("events")
        .select("type, created_at")
        .eq("deal_id", deal.id)
        .in("type", ["listing.viewed", "listing.saved"]);

      for (const ev of events ?? []) {
        if (ev.type === "listing.viewed") {
          viewsTotal += 1;
          if (ev.created_at >= since30) views30d += 1;
        }
        if (ev.type === "listing.saved" && ev.created_at >= since30) {
          saves30d += 1;
        }
      }
    }

    const { count } = await admin
      .from("saved_homes")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", listing.id);

    return {
      ok: true,
      data: {
        viewsTotal,
        views30d,
        savesCurrent: count ?? 0,
        saves30d,
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}
