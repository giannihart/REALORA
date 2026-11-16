"use server";

import { lookupProperty } from "@/lib/services/acris";
import type { PropertyRecord } from "@/lib/services/acris-types";
import { geosearchAddress } from "@/lib/nyc/geosearch";
import { latLngToPin } from "@/lib/nyc/map-bounds";
import { dollarsToCents, listingFromRows, payloadSlug } from "@/lib/data/map";
import {
  assertParty,
  hasRole,
  insertEvent,
  insertTaskRows,
  isStaff,
  loadParties,
  requireActor,
  type Actor,
} from "@/lib/actions/actor";
import { DealActionError, fail, wrapError, type ActionResult } from "@/lib/actions/errors";
import { getSnapshotAction, type AppSnapshot } from "@/lib/actions/snapshot";
import { lintFairHousing } from "@/lib/compliance/fair-housing";
import { isProductionDataMode } from "@/lib/data/mode";
import type { Database, Json, Tables } from "@/lib/database.types";
import type { HomeType, Listing } from "@/lib/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ListingMediaKind = "photo" | "tour3d" | "video";

export type ListingMediaItem = {
  url: string;
  kind: ListingMediaKind;
  position: number;
};

export type CreateListingInput = {
  address: string;
  neighborhood: string;
  city: string;
  state?: string;
  zip?: string;
  borough?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  type?: HomeType;
  yearBuilt?: number;
  description?: string;
  buyerAgentOffered?: boolean;
  mediaDate?: string;
  record?: PropertyRecord | null;
  lat?: number | null;
  lng?: number | null;
};

export type LiveListingFilters = {
  location?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  beds?: number | null;
  bedsExact?: boolean;
  baths?: number | null;
  type?: string | null;
  types?: string[] | null;
  minSqft?: number | null;
  maxSqft?: number | null;
  listedWithinDays?: number | null;
  status?: "live" | "under_contract" | "closed" | "all";
  limit?: number;
  newest?: boolean;
};

const SELLER_OWNERS: Tables<"deal_parties">["role"][] = ["seller", "co_seller"];
const BROKER_ROLES: Tables<"deal_parties">["role"][] = ["broker_of_record", "agent_seller"];

/**
 * Intake no longer seeds a seller Mark-done checklist.
 * Prep work is driven by Documents (listing agreement) + next-step CTAs
 * (price / photos on the listing page). Media and permit research stay in
 * “Realora is handling it” — not seller assignments.
 */
const INTAKE_TASKS: { title: string; description: string; owner_role: string }[] = [];

async function skipOpenTasksMatching(
  admin: Actor["admin"],
  dealId: string,
  pattern: RegExp,
) {
  const { data: tasks } = await admin
    .from("tasks")
    .select("id, title, status")
    .eq("deal_id", dealId);
  const now = new Date().toISOString();
  for (const task of tasks ?? []) {
    if (task.status === "done" || task.status === "skipped") continue;
    if (!pattern.test(task.title ?? "")) continue;
    await admin
      .from("tasks")
      .update({ status: "skipped", completed_at: now })
      .eq("id", task.id);
  }
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function extraFromOnboarding(payload: Json | null | undefined): boolean {
  return asRecord(payload).fromOnboarding === true;
}

function extraFromOnboardingDemo(payload: Json | null | undefined): boolean {
  return asRecord(payload).isDemoDeal === true;
}

function mediaItems(value: Json | null | undefined): ListingMediaItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const url = typeof row.url === "string" ? row.url : "";
      if (!url) return null;
      const kind: ListingMediaKind =
        row.kind === "tour3d" || row.kind === "video" ? row.kind : "photo";
      const position = typeof row.position === "number" ? row.position : index;
      return { url, kind, position };
    })
    .filter((item): item is ListingMediaItem => item != null)
    .sort((a, b) => a.position - b.position)
    .map((item, position) => ({ ...item, position }));
}

function slugify(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function fresh(): Promise<ActionResult<AppSnapshot>> {
  return getSnapshotAction();
}

export async function resolveListingRow(
  admin: Actor["admin"],
  listingId: string,
): Promise<{ listing: Tables<"listings">; property: Tables<"properties"> }> {
  const { data: byId } = await admin.from("listings").select("*").eq("id", listingId).maybeSingle();
  if (byId) {
    const { data: property } = await admin
      .from("properties")
      .select("*")
      .eq("id", byId.property_id)
      .maybeSingle();
    if (!property) throw new DealActionError("not_found", "Property not found.");
    return { listing: byId, property };
  }
  const { data: properties } = await admin.from("properties").select("*");
  const property = (properties ?? []).find((p) => {
    const extra = asRecord(p.acris_payload);
    return extra.slug === listingId || p.id === listingId;
  });
  if (!property) throw new DealActionError("not_found", "Listing not found.");
  const { data: listing } = await admin
    .from("listings")
    .select("*")
    .eq("property_id", property.id)
    .maybeSingle();
  if (!listing) throw new DealActionError("not_found", "Listing not found.");
  return { listing, property };
}

function canEditListing(
  actor: Actor,
  listing: Tables<"listings">,
  parties: Tables<"deal_parties">[],
): boolean {
  if (isStaff(actor)) return true;
  if (listing.seller_id === actor.userId) return true;
  return hasRole(parties, actor.userId, BROKER_ROLES);
}

async function insertMilestones(admin: Actor["admin"], dealId: string) {
  const seller = [
    { key: "s1", label: "Listing prep", position: 1 },
    { key: "s2", label: "Listing is Live", position: 2 },
    { key: "s3", label: "Offers", position: 3 },
    { key: "s4", label: "Accepted", position: 4 },
    { key: "s5", label: "Contract", position: 5 },
    { key: "s6", label: "Diligence", position: 6 },
    { key: "s7", label: "Clear to close", position: 7 },
    { key: "s8", label: "Closing", position: 8 },
  ];
  const buyer = [
    { key: "b1", label: "Buyer onboarding", position: 1 },
    { key: "b2", label: "Offer submitted", position: 2 },
    { key: "b3", label: "Offer accepted", position: 3 },
    { key: "b4", label: "Earnest money deposit", position: 4 },
    { key: "b5", label: "Inspection and due diligence", position: 5 },
    { key: "b6", label: "Mortgage underwriting and appraisal", position: 6 },
    { key: "b7", label: "Title & closing prep", position: 7 },
    { key: "b8", label: "Clear to close", position: 8 },
    { key: "b9", label: "Closing day", position: 9 },
    { key: "b10", label: "Deed recorded & keys", position: 10 },
  ];
  await admin.from("milestones").insert([
    ...seller.map((m) => ({
      deal_id: dealId,
      key: m.key,
      label: m.label,
      audience: "seller" as const,
      position: m.position,
      status: "upcoming" as const,
    })),
    ...buyer.map((m) => ({
      deal_id: dealId,
      key: m.key,
      label: m.label,
      audience: "buyer" as const,
      position: m.position,
      status: "upcoming" as const,
    })),
  ]);
}

export async function lookupPropertyAction(
  address: string,
  force = false,
): Promise<ActionResult<PropertyRecord | null>> {
  try {
    const record = await lookupProperty(address, { force });
    return { ok: true, data: record };
  } catch (error) {
    return wrapError(error);
  }
}

export async function geosearchAction(
  text: string,
): Promise<ActionResult<Awaited<ReturnType<typeof geosearchAddress>>>> {
  try {
    const hits = await geosearchAddress(text, 5);
    return { ok: true, data: hits };
  } catch (error) {
    return wrapError(error);
  }
}

export async function createListingAction(
  input: CreateListingInput,
): Promise<ActionResult<AppSnapshot & { listingId: string }>> {
  try {
    const actor = await requireActor();
    // Draft listings are owned by any authenticated seller. Ownership verification
    // (tier 3) is required to publish — see publishListingAction.

    const { data: existingForSeller } = await actor.admin
      .from("listings")
      .select("id, status")
      .eq("seller_id", actor.userId);
    const active = (existingForSeller ?? []).find((row) => {
      const s = (row.status ?? "").toLowerCase();
      return s !== "closed" && s !== "withdrawn";
    });
    // One active listing: resume it on onboarding retry instead of blocking Tap to sign.
    if (active) {
      const { listing, property } = await resolveListingRow(actor.admin, active.id);
      const address = input.address.trim();
      if (!address) return fail("validation", "Address is required.");
      const listingUpdates: Database["public"]["Tables"]["listings"]["Update"] = {
        updated_at: new Date().toISOString(),
        buyer_agent_offered: Boolean(input.buyerAgentOffered),
      };
      if (input.price != null) listingUpdates.price_cents = dollarsToCents(input.price);
      await actor.admin.from("listings").update(listingUpdates).eq("id", listing.id);

      const extra = asRecord(property.acris_payload);
      const nextExtra = {
        ...extra,
        title: address,
        neighborhood: input.neighborhood,
        fromOnboarding: true,
      };
      await actor.admin
        .from("properties")
        .update({
          address_line: address,
          city: input.city.trim() || property.city || "New York",
          state: input.state ?? property.state ?? "NY",
          zip: input.zip?.trim() || property.zip,
          borough: input.borough?.trim() || property.borough,
          property_type: input.type ?? property.property_type,
          beds: input.beds ?? property.beds,
          baths: input.baths ?? property.baths,
          sqft: input.sqft ?? property.sqft,
          year_built: input.yearBuilt ?? property.year_built,
          acris_payload: nextExtra as Json,
        })
        .eq("id", property.id);

      const snap = await getSnapshotAction();
      if (!snap.ok) return snap;
      return {
        ok: true,
        data: { ...snap.data, listingId: payloadSlug(nextExtra as Json) || listing.id },
      };
    }

    const address = input.address.trim();
    if (!address) return fail("validation", "Address is required.");

    const record = input.record ?? null;
    const lat = input.lat ?? record?.lat ?? null;
    const lng = input.lng ?? record?.lng ?? null;
    const pin = lat != null && lng != null ? latLngToPin(lat, lng) : { x: 50, y: 50 };
    const zip = input.zip?.trim() || null;
    const city = input.city.trim() || "New York";
    const normalized = (record?.normalizedAddress ?? "").toLowerCase();
    const borough =
      input.borough?.trim() ||
      (normalized.includes("brooklyn")
        ? "Brooklyn"
        : normalized.includes("manhattan")
          ? "Manhattan"
          : normalized.includes("queens")
            ? "Queens"
            : null);

    let propertyId: string | null = null;
    if (record?.bbl) {
      const { data: byBbl } = await actor.admin
        .from("properties")
        .select("*")
        .eq("bbl", record.bbl)
        .maybeSingle();
      if (byBbl) {
        const { data: existingListing } = await actor.admin
          .from("listings")
          .select("id")
          .eq("property_id", byBbl.id)
          .maybeSingle();
        if (existingListing) {
          return fail("validation", "This property already has a listing.");
        }
        propertyId = byBbl.id;
      }
    }

    const extraBase: Record<string, unknown> = {
      title: address,
      neighborhood: input.neighborhood,
      about: input.description
        ? [input.description]
        : ["Draft listing created from seller onboarding. Media and copy still in prep."],
      pin,
      pinLabel: "Draft",
      heating: "TBD",
      taxes: 0,
      lotSqft: 0,
      stagingLabels: input.mediaDate ? ["Media scheduled"] : [],
      syndication: [],
      marketplace: false,
      isDemoDeal: false,
      fromOnboarding: true,
      ...(record
        ? {
            bbl: record.bbl,
            normalizedAddress: record.normalizedAddress,
            ownersOfRecord: record.ownersOfRecord,
            lastSale: record.lastSale,
            documentCount: record.documentCount,
            openViolations: record.openViolations,
            lat: record.lat,
            lng: record.lng,
          }
        : {}),
    };

    if (!propertyId) {
      const slugGuess = slugify(address);
      extraBase.slug = slugGuess;
      const insertPayload: Database["public"]["Tables"]["properties"]["Insert"] = {
        bbl: record?.bbl ?? null,
        address_line: address,
        city,
        state: input.state ?? "NY",
        zip,
        borough: borough || null,
        block: record ? record.bbl.slice(1, 6) : null,
        lot: record ? record.bbl.slice(6, 10) : null,
        property_type: input.type ?? "Townhouse",
        beds: input.beds ?? 4,
        baths: input.baths ?? 3,
        sqft: input.sqft ?? 3200,
        year_built: input.yearBuilt ?? null,
        lat,
        lng,
        acris_payload: record ? (extraBase as Json) : null,
        acris_fetched_at: record ? new Date().toISOString() : null,
      };
      const { data: created, error } = await actor.admin
        .from("properties")
        .insert(insertPayload)
        .select("*")
        .single();
      if (error || !created) {
        const { data: byAddress } = await actor.admin
          .from("properties")
          .select("*")
          .eq("address_line", address)
          .eq("zip", zip ?? "")
          .maybeSingle();
        if (byAddress) {
          const { data: existingListing } = await actor.admin
            .from("listings")
            .select("id")
            .eq("property_id", byAddress.id)
            .maybeSingle();
          if (existingListing) {
            return fail("validation", "This property already has a listing.");
          }
          propertyId = byAddress.id;
        } else {
          throw new DealActionError("validation", error?.message ?? "Could not create property.");
        }
      } else {
        propertyId = created.id;
      }
    } else {
      const { data: existing } = await actor.admin
        .from("properties")
        .select("*")
        .eq("id", propertyId)
        .single();
      const merged = {
        ...asRecord(existing?.acris_payload),
        ...extraBase,
      };
      await actor.admin
        .from("properties")
        .update({
          address_line: address,
          city,
          state: input.state ?? "NY",
          zip,
          borough: borough || existing?.borough,
          property_type: input.type ?? existing?.property_type ?? "Townhouse",
          beds: input.beds ?? existing?.beds ?? 4,
          baths: input.baths ?? existing?.baths ?? 3,
          sqft: input.sqft ?? existing?.sqft ?? 3200,
          year_built: input.yearBuilt ?? existing?.year_built,
          lat: lat ?? existing?.lat,
          lng: lng ?? existing?.lng,
          acris_payload: record ? (merged as Json) : existing?.acris_payload ?? null,
        })
        .eq("id", propertyId);
    }

    if (!propertyId) {
      throw new DealActionError("validation", "Could not create property.");
    }

    const { data: listing, error: listingErr } = await actor.admin
      .from("listings")
      .insert({
        property_id: propertyId,
        seller_id: actor.userId,
        status: "draft",
        price_cents: dollarsToCents(input.price ?? 0),
        description: input.description ?? null,
        media: [],
        buyer_agent_offered: Boolean(input.buyerAgentOffered),
      })
      .select("*")
      .single();
    if (listingErr || !listing) {
      throw new DealActionError("validation", listingErr?.message ?? "Could not create listing.");
    }

    const slug = slugify(address) || listing.id;
    const { data: property } = await actor.admin
      .from("properties")
      .select("*")
      .eq("id", propertyId)
      .single();
    const mergedPayload = {
      ...asRecord(property?.acris_payload),
      ...extraBase,
      slug,
    } as Json;
    await actor.admin
      .from("properties")
      .update({ acris_payload: mergedPayload })
      .eq("id", propertyId);

    const { data: deal, error: dealErr } = await actor.admin
      .from("deals")
      .insert({
        listing_id: listing.id,
        state: "intake",
      })
      .select("*")
      .single();
    if (dealErr || !deal) {
      throw new DealActionError("validation", dealErr?.message ?? "Could not create deal.");
    }

    await actor.admin.from("deal_parties").insert({
      deal_id: deal.id,
      user_id: actor.userId,
      role: "seller",
      side: "seller",
    });

    if (INTAKE_TASKS.length) {
      await insertTaskRows(
        actor.admin,
        deal.id,
        actor.userId,
        INTAKE_TASKS.map((t) => ({
          title: t.title,
          description: t.description,
          // Resolve owner from party role — never force seller onto staff tasks.
          owner_role: t.owner_role,
          due_date: t.title === "Schedule photography" ? input.mediaDate || null : null,
          auto: true,
        })),
      );
    }
    await insertMilestones(actor.admin, deal.id);
    await insertEvent(actor.admin, deal.id, actor.userId, "listing.created", {
      listing_id: listing.id,
    });
    await insertEvent(actor.admin, deal.id, actor.userId, "deal.intake", {});

    const snap = await getSnapshotAction();
    if (!snap.ok) return snap;
    return { ok: true, data: { ...snap.data, listingId: slug || listing.id } };
  } catch (error) {
    return wrapError(error);
  }
}

export async function updateListingAction(
  listingId: string,
  patch: {
    price?: number;
    description?: string;
    photos?: string[];
    media?: ListingMediaItem[];
    buyerAgentOffered?: boolean;
    status?: "draft" | "live" | "in_contract" | "closed" | "withdrawn";
    mediaCostCents?: number;
    campaignCostCents?: number;
    pricingGuidance?: string | null;
    /** ISO date (YYYY-MM-DD) for photography / media visit. */
    mediaDate?: string;
  },
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { listing, property } = await resolveListingRow(actor.admin, listingId);
    const { data: deal } = await actor.admin
      .from("deals")
      .select("*")
      .eq("listing_id", listing.id)
      .maybeSingle();
    const parties = deal ? await loadParties(actor.admin, deal.id) : [];
    if (!canEditListing(actor, listing, parties)) {
      throw new DealActionError("forbidden", "Only the seller or broker may update this listing.");
    }
    if (listing.status !== "draft" && listing.status !== "live") {
      throw new DealActionError("wrong_state", "Listing can only be edited while draft or live.");
    }

    const updates: Database["public"]["Tables"]["listings"]["Update"] = {
      updated_at: new Date().toISOString(),
    };
    if (patch.price != null) updates.price_cents = dollarsToCents(patch.price);
    if (patch.description != null && isProductionDataMode()) {
      const hits = lintFairHousing(patch.description);
      if (hits.length) {
        if (deal) {
          await insertEvent(actor.admin, deal.id, actor.userId, "fair_housing.blocked", {
            terms: hits,
            listing_id: listing.id,
          });
        }
        throw new DealActionError(
          "fair_housing",
          `Listing description blocked. Fair-housing / steering terms: ${hits.join(", ")}.`,
        );
      }
    }
    const shouldPatchPayload =
      patch.description != null ||
      patch.pricingGuidance !== undefined ||
      patch.mediaDate != null;
    if (shouldPatchPayload) {
      const extra = asRecord(property.acris_payload);
      if (patch.description != null) {
        updates.description = patch.description;
        const about = Array.isArray(extra.about) ? [...(extra.about as string[])] : [];
        about[0] = patch.description;
        extra.about = about;
      }
      if (patch.pricingGuidance !== undefined) {
        const next = patch.pricingGuidance?.trim() || null;
        if (next) extra.pricingGuidance = next;
        else delete extra.pricingGuidance;
      }
      if (patch.mediaDate != null) {
        const when = patch.mediaDate.trim();
        if (when) {
          extra.mediaDate = when;
          const labels = Array.isArray(extra.stagingLabels)
            ? [...(extra.stagingLabels as string[])]
            : [];
          if (!labels.some((l) => /media scheduled/i.test(l))) {
            labels.push("Media scheduled");
          }
          extra.stagingLabels = labels;
        }
      }
      await actor.admin
        .from("properties")
        .update({ acris_payload: extra as Json })
        .eq("id", property.id);
    }
    if (patch.mediaDate && deal) {
      await skipOpenTasksMatching(actor.admin, deal.id, /schedule photography|photography|media/i);
    }
    const nextPrice =
      patch.price != null ? dollarsToCents(patch.price) : Number(listing.price_cents ?? 0);
    const nextDescription =
      patch.description != null ? patch.description : listing.description;
    if (deal && nextPrice > 0 && nextDescription?.trim()) {
      await skipOpenTasksMatching(actor.admin, deal.id, /set asking price/i);
    }
    if (deal && (patch.media?.length || patch.photos?.length)) {
      await skipOpenTasksMatching(actor.admin, deal.id, /upload listing photos/i);
    }
    if (patch.buyerAgentOffered != null) updates.buyer_agent_offered = patch.buyerAgentOffered;
    if (patch.mediaCostCents != null || patch.campaignCostCents != null) {
      if (!isStaff(actor)) {
        throw new DealActionError("forbidden", "Only an AE or broker may edit media and campaign costs.");
      }
      if (patch.mediaCostCents != null) updates.media_cost_cents = Math.max(0, Math.round(patch.mediaCostCents));
      if (patch.campaignCostCents != null) {
        updates.campaign_cost_cents = Math.max(0, Math.round(patch.campaignCostCents));
      }
    }
    if (patch.media) {
      updates.media = patch.media.map((item, position) => ({ ...item, position }));
    } else if (patch.photos) {
      updates.media = patch.photos.map((url, position) => ({ url, kind: "photo", position }));
    }
    if (patch.status) {
      updates.status =
        patch.status === "in_contract"
          ? "under_contract"
          : patch.status === "closed"
            ? "closed"
            : patch.status === "withdrawn"
              ? "withdrawn"
              : patch.status === "draft"
                ? "draft"
                : "live";
    }
    const { error } = await actor.admin.from("listings").update(updates).eq("id", listing.id);
    if (error) throw new DealActionError("validation", error.message);
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function publishListingAction(listingId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    if ((actor.verification?.tier ?? 0) < 3) {
      return fail(
        "tier_too_low",
        "Verification tier 3 is required to publish a listing.",
      );
    }
    const { listing, property } = await resolveListingRow(actor.admin, listingId);
    const { data: deal } = await actor.admin
      .from("deals")
      .select("*")
      .eq("listing_id", listing.id)
      .maybeSingle();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    const parties = await loadParties(actor.admin, deal.id);
    if (!canEditListing(actor, listing, parties)) {
      throw new DealActionError("forbidden", "Only the seller or broker may publish this listing.");
    }
    if (listing.status !== "draft") {
      throw new DealActionError("wrong_state", "Only a draft listing can be published.");
    }
    if (!(Number(listing.price_cents) > 0)) {
      return fail("validation", "Set an asking price before publishing.");
    }
    const photos = mediaItems(listing.media).filter((m) => m.kind === "photo");
    if (photos.length < 1) {
      return fail("validation", "Add at least one photo before publishing.");
    }
    if (!listing.property_id) {
      return fail("validation", "A property must be attached before publishing.");
    }

    const fromOnboarding = extraFromOnboarding(property.acris_payload);
    if (fromOnboarding && extraFromOnboardingDemo(property.acris_payload) !== true) {
      const { data: agreements } = await actor.admin
        .from("documents")
        .select("id, status, name")
        .eq("deal_id", deal.id)
        .neq("status", "deleted");
      const fullyExecuted = (agreements ?? []).some((d) => {
        if (!/listing agreement/i.test(d.name)) return false;
        const s = (d.status ?? "").toLowerCase();
        return s === "fully executed" || s === "completed" || s === "fully_executed";
      });
      if (!fullyExecuted) {
        return fail(
          "validation",
          "The listing agreement must be fully executed (seller and brokerage) before publishing.",
        );
      }
    }

    const now = new Date().toISOString();
    const extra = asRecord(property.acris_payload);
    extra.marketplace = true;
    extra.pinLabel = extra.pinLabel === "Draft" ? "" : extra.pinLabel;
    extra.syndication = [
      { channel: "RLS", live: true, at: now.slice(0, 16).replace("T", " ") },
      { channel: "StreetEasy", live: true, at: now.slice(0, 16).replace("T", " ") },
      { channel: "Zillow", live: true, at: now.slice(0, 16).replace("T", " ") },
      { channel: "Trulia", live: true, at: now.slice(0, 16).replace("T", " ") },
    ];
    await actor.admin
      .from("properties")
      .update({ acris_payload: extra as Json })
      .eq("id", property.id);
    await actor.admin
      .from("listings")
      .update({ status: "live", updated_at: now })
      .eq("id", listing.id);

    if (deal.state === "intake") {
      await actor.admin
        .from("deals")
        .update({ state: "prep", updated_at: now })
        .eq("id", deal.id);
      await insertEvent(actor.admin, deal.id, actor.userId, "deal.prep", {});
      await actor.admin
        .from("deals")
        .update({ state: "live", updated_at: now })
        .eq("id", deal.id);
      await insertEvent(actor.admin, deal.id, actor.userId, "deal.live", {});
    } else if (deal.state === "prep") {
      await actor.admin
        .from("deals")
        .update({ state: "live", updated_at: now })
        .eq("id", deal.id);
      await insertEvent(actor.admin, deal.id, actor.userId, "deal.live", {});
    }

    await actor.admin
      .from("milestones")
      .update({ status: "complete", completed_at: now })
      .eq("deal_id", deal.id)
      .in("key", ["s1", "s2"]);

    await insertEvent(actor.admin, deal.id, actor.userId, "listing.published", {
      listing_id: listing.id,
    });
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function withdrawListingAction(listingId: string): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { listing, property } = await resolveListingRow(actor.admin, listingId);
    const { data: deal } = await actor.admin
      .from("deals")
      .select("*")
      .eq("listing_id", listing.id)
      .maybeSingle();
    const parties = deal ? await loadParties(actor.admin, deal.id) : [];
    assertParty(
      canEditListing(actor, listing, parties),
      "Only the seller or broker may withdraw this listing.",
    );

    const { data: accepted } = deal
      ? await actor.admin
          .from("offers")
          .select("id")
          .eq("deal_id", deal.id)
          .eq("status", "accepted")
          .maybeSingle()
      : { data: null };

    if (accepted) {
      throw new DealActionError(
        "wrong_state",
        "An accepted offer is on this listing. Use fell-through after contract, not withdraw.",
      );
    }

    const extra = asRecord(property.acris_payload);
    extra.marketplace = false;
    await actor.admin
      .from("properties")
      .update({ acris_payload: extra as Json })
      .eq("id", property.id);
    await actor.admin
      .from("listings")
      .update({ status: "withdrawn", updated_at: new Date().toISOString() })
      .eq("id", listing.id);

    if (deal) {
      await insertEvent(actor.admin, deal.id, actor.userId, "listing.withdrawn", {
        listing_id: listing.id,
        note: "No accepted offer. Deal state unchanged; listing status governs visibility.",
      });
    }
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function recordAgreementSignedAction(
  listingId: string,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { listing } = await resolveListingRow(actor.admin, listingId);
    const { data: deal } = await actor.admin
      .from("deals")
      .select("*")
      .eq("listing_id", listing.id)
      .maybeSingle();
    if (!deal) throw new DealActionError("not_found", "Deal not found.");
    const parties = await loadParties(actor.admin, deal.id);
    if (!canEditListing(actor, listing, parties)) {
      throw new DealActionError("forbidden", "Only the seller or broker may sign.");
    }
    const now = new Date().toISOString();
    await insertEvent(actor.admin, deal.id, actor.userId, "agreement_mock_signed_at", {
      at: now,
    });
    const { data: tasks } = await actor.admin.from("tasks").select("*").eq("deal_id", deal.id);
    const agreement = (tasks ?? []).find((t) => /listing agreement/i.test(t.title));
    if (agreement && agreement.status !== "done") {
      await actor.admin
        .from("tasks")
        .update({ status: "done", completed_at: now })
        .eq("id", agreement.id);
    }
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function uploadListingMediaAction(
  listingId: string,
  formData: FormData,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { listing } = await resolveListingRow(actor.admin, listingId);
    const { data: deal } = await actor.admin
      .from("deals")
      .select("*")
      .eq("listing_id", listing.id)
      .maybeSingle();
    const parties = deal ? await loadParties(actor.admin, deal.id) : [];
    if (!canEditListing(actor, listing, parties)) {
      throw new DealActionError("forbidden", "Only the seller or broker may upload media.");
    }
    if (listing.status !== "draft" && listing.status !== "live") {
      throw new DealActionError("wrong_state", "Media can only change while draft or live.");
    }

    const files = formData.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return fail("validation", "Choose at least one file.");

    const existing = mediaItems(listing.media);
    let position = existing.length;
    for (const file of files) {
      const ext =
        file.type === "image/webp"
          ? "webp"
          : file.type === "image/png"
            ? "png"
            : file.type === "video/mp4"
              ? "mp4"
              : "jpg";
      const path = `${listing.id}/${crypto.randomUUID()}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error } = await actor.admin.storage.from("listing-media").upload(path, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (error) throw new DealActionError("validation", error.message);
      const { data: pub } = actor.admin.storage.from("listing-media").getPublicUrl(path);
      existing.push({
        url: pub.publicUrl,
        kind: file.type.startsWith("video/") ? "video" : "photo",
        position,
      });
      position += 1;
    }

    await actor.admin
      .from("listings")
      .update({ media: existing, updated_at: new Date().toISOString() })
      .eq("id", listing.id);
    if (deal && existing.some((m) => m.kind === "photo")) {
      await skipOpenTasksMatching(actor.admin, deal.id, /upload listing photos/i);
    }
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function deleteListingMediaAction(
  listingId: string,
  url: string,
): Promise<ActionResult<AppSnapshot>> {
  try {
    const actor = await requireActor();
    const { listing } = await resolveListingRow(actor.admin, listingId);
    const { data: deal } = await actor.admin
      .from("deals")
      .select("*")
      .eq("listing_id", listing.id)
      .maybeSingle();
    const parties = deal ? await loadParties(actor.admin, deal.id) : [];
    if (!canEditListing(actor, listing, parties)) {
      throw new DealActionError("forbidden", "Only the seller or broker may delete media.");
    }
    const next = mediaItems(listing.media)
      .filter((item) => item.url !== url)
      .map((item, position) => ({ ...item, position }));
    const marker = "/storage/v1/object/public/listing-media/";
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      const path = decodeURIComponent(url.slice(idx + marker.length));
      await actor.admin.storage.from("listing-media").remove([path]);
    }
    await actor.admin
      .from("listings")
      .update({ media: next, updated_at: new Date().toISOString() })
      .eq("id", listing.id);
    return fresh();
  } catch (error) {
    return wrapError(error);
  }
}

export async function queryLiveListingsAction(
  filters: LiveListingFilters = {},
): Promise<ActionResult<Listing[]>> {
  try {
    const supabase = await createServerSupabaseClient();

    let propertyQuery = supabase.from("properties").select("*");
    if (filters.beds != null) {
      if (filters.bedsExact && filters.beds > 0 && filters.beds < 5) {
        propertyQuery = propertyQuery.eq("beds", filters.beds);
      } else {
        propertyQuery = propertyQuery.gte("beds", filters.beds);
      }
    }
    if (filters.baths != null) propertyQuery = propertyQuery.gte("baths", filters.baths);
    if (filters.minSqft != null) propertyQuery = propertyQuery.gte("sqft", filters.minSqft);
    if (filters.maxSqft != null) propertyQuery = propertyQuery.lte("sqft", filters.maxSqft);
    const typeList = (filters.types ?? []).filter((t) => t && t !== "All" && t !== "Any" && t !== "Co-op");
    if (typeList.length) {
      propertyQuery = propertyQuery.in("property_type", typeList);
    } else if (filters.type && filters.type !== "All" && filters.type !== "Any" && filters.type !== "Co-op") {
      propertyQuery = propertyQuery.eq("property_type", filters.type);
    }
    const location = (filters.location ?? "").trim();
    const citywide =
      !location || /^(new york|new york, ny|ny|nyc)$/i.test(location);
    if (!citywide) {
      const q = (location.replace(/[%_]/g, " ").split(",")[0] ?? location)
        .replace(/,/g, " ")
        .trim();
      propertyQuery = propertyQuery.or(
        `address_line.ilike.%${q}%,borough.ilike.%${q}%,city.ilike.%${q}%,acris_payload->>neighborhood.ilike.%${q}%`,
      );
    }
    const { data: propertyRows, error: propertyError } = await propertyQuery;
    if (propertyError) throw new DealActionError("validation", propertyError.message);
    const properties = propertyRows ?? [];
    if (!properties.length) return { ok: true, data: [] };
    const propertyById = new Map(properties.map((p) => [p.id, p]));

    let listingQuery = supabase
      .from("listings")
      .select("*")
      .in("property_id", properties.map((p) => p.id))
      .neq("status", "draft")
      .neq("status", "withdrawn");

    if (!filters.status || filters.status === "live") {
      listingQuery = listingQuery.eq("status", "live");
    } else if (filters.status !== "all") {
      listingQuery = listingQuery.eq("status", filters.status);
    }
    if (filters.minPrice != null) {
      listingQuery = listingQuery.gte("price_cents", dollarsToCents(filters.minPrice));
    }
    if (filters.maxPrice != null) {
      listingQuery = listingQuery.lte("price_cents", dollarsToCents(filters.maxPrice));
    }
    if (filters.listedWithinDays != null) {
      const since = new Date(Date.now() - filters.listedWithinDays * 86_400_000).toISOString();
      listingQuery = listingQuery.gte("created_at", since);
    }
    if (filters.newest) {
      listingQuery = listingQuery.order("created_at", { ascending: false });
    }
    if (filters.limit) {
      listingQuery = listingQuery.limit(filters.limit);
    }

    const { data, error } = await listingQuery;
    if (error) throw new DealActionError("validation", error.message);

    const listings = (data ?? [])
      .map((listing) => {
        const property = propertyById.get(listing.property_id);
        return property ? listingFromRows(listing, property) : null;
      })
      .filter((row): row is Listing => row != null)
      .filter((row) => row.marketplace !== false || filters.status === "all");

    return { ok: true, data: listings };
  } catch (error) {
    return wrapError(error);
  }
}

export async function getPublicListingAction(
  id: string,
): Promise<ActionResult<Listing | null>> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: byId } = await supabase.from("listings").select("*").eq("id", id).maybeSingle();
    let listing = byId;
    let property: Tables<"properties"> | null = null;
    if (listing) {
      const { data } = await supabase
        .from("properties")
        .select("*")
        .eq("id", listing.property_id)
        .maybeSingle();
      property = data;
    } else {
      const { data: properties } = await supabase.from("properties").select("*");
      property =
        (properties ?? []).find((p) => payloadSlug(p.acris_payload) === id) ?? null;
      if (property) {
        const { data } = await supabase
          .from("listings")
          .select("*")
          .eq("property_id", property.id)
          .maybeSingle();
        listing = data;
      }
    }
    if (!listing || !property) return { ok: true, data: null };
    return { ok: true, data: listingFromRows(listing, property) };
  } catch (error) {
    return wrapError(error);
  }
}

