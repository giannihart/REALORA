"use server";

import { isStaff, loadParties, requireActor } from "@/lib/actions/actor";
import { DealActionError, wrapError, type ActionResult } from "@/lib/actions/errors";
import { isBothSidesOpportunity } from "@/lib/compliance/gates";

export type Measured<T> = { value: T } | { unmeasured: true };

function measured<T>(value: T | null | undefined): Measured<T> {
  if (value == null || (typeof value === "number" && Number.isNaN(value))) return { unmeasured: true };
  return { value };
}

export type ListingScore = {
  listingId: string;
  address: string;
  daysIntakeToLive: Measured<number>;
  daysLiveToClose: Measured<number>;
  offerCount: number;
  offerDepth: number;
  winningVsListPct: Measured<number>;
  mediaCostCents: number;
  campaignCostCents: number;
  fallThroughReasons: Record<string, number>;
};

export type DealScore = {
  dealId: string;
  address: string;
  activityEvents: number;
  activityTasks: number;
};

export type PortfolioScore = {
  closes: number;
  grossFeesCents: number;
  averageDaysToClose: Measured<number>;
  consentRate: Measured<number>;
};

export type Scorecard = {
  listings: ListingScore[];
  deals: DealScore[];
  portfolio: PortfolioScore;
};

function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86400000);
}

export async function getScorecardAction(): Promise<ActionResult<Scorecard>> {
  try {
    const actor = await requireActor();
    const { data: myParties } = await actor.admin
      .from("deal_parties")
      .select("deal_id, role")
      .eq("user_id", actor.userId);
    const ae = (myParties ?? []).some((p) => p.role === "agent_seller" || p.role === "broker_of_record");
    if (!isStaff(actor) && !ae) {
      throw new DealActionError("forbidden", "Scorecard is available to the AE and broker of record.");
    }

    const [{ data: listings }, { data: properties }, { data: deals }, { data: offers }, { data: events }, { data: tasks }, { data: money }] =
      await Promise.all([
        actor.admin.from("listings").select("*"),
        actor.admin.from("properties").select("id, address_line"),
        actor.admin.from("deals").select("*"),
        actor.admin.from("offers").select("*"),
        actor.admin.from("events").select("deal_id, type, created_at"),
        actor.admin.from("tasks").select("deal_id, id"),
        actor.admin.from("money_events").select("deal_id, kind, amount_cents, status"),
      ]);

    const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));
    const dealByListing = new Map((deals ?? []).map((d) => [d.listing_id, d]));
    const offersByDeal = new Map<string, typeof offers>();
    for (const offer of offers ?? []) {
      const list = offersByDeal.get(offer.deal_id) ?? [];
      list.push(offer);
      offersByDeal.set(offer.deal_id, list);
    }
    const eventsByDeal = new Map<string, { type: string; created_at: string }[]>();
    for (const ev of events ?? []) {
      if (!ev.deal_id) continue;
      const list = eventsByDeal.get(ev.deal_id) ?? [];
      list.push(ev);
      eventsByDeal.set(ev.deal_id, list);
    }
    const tasksByDeal = new Map<string, number>();
    for (const task of tasks ?? []) {
      tasksByDeal.set(task.deal_id, (tasksByDeal.get(task.deal_id) ?? 0) + 1);
    }

    const listingScores: ListingScore[] = (listings ?? []).map((listing) => {
      const deal = dealByListing.get(listing.id);
      const address = propertyById.get(listing.property_id)?.address_line ?? listing.id.slice(0, 8);
      const dealEvents = deal ? eventsByDeal.get(deal.id) ?? [] : [];
      const liveAt = dealEvents.find((e) => e.type === "listing.published" || e.type === "deal.live")?.created_at ?? null;
      const closedAt = dealEvents.find((e) => e.type === "deal.closed")?.created_at ?? null;
      const intakeAt = listing.created_at;
      const dealOffers = deal ? offersByDeal.get(deal.id) ?? [] : [];
      const accepted = dealOffers.find((o) => o.status === "accepted");
      const winningVsList =
        accepted && Number(listing.price_cents) > 0
          ? (Number(accepted.price_cents) / Number(listing.price_cents)) * 100
          : null;
      const fallThroughReasons: Record<string, number> = {};
      if (deal?.state === "fell_through" && deal.fell_through_reason) {
        fallThroughReasons[deal.fell_through_reason] = 1;
      }
      return {
        listingId: listing.id,
        address,
        daysIntakeToLive: measured(liveAt ? daysBetween(intakeAt, liveAt) : null),
        daysLiveToClose: measured(liveAt && closedAt ? daysBetween(liveAt, closedAt) : null),
        offerCount: dealOffers.length,
        offerDepth: dealOffers.length,
        winningVsListPct: measured(winningVsList),
        mediaCostCents: Number(listing.media_cost_cents ?? 0),
        campaignCostCents: Number(listing.campaign_cost_cents ?? 0),
        fallThroughReasons,
      };
    });

    const dealScores: DealScore[] = (deals ?? []).map((deal) => {
      const listing = (listings ?? []).find((l) => l.id === deal.listing_id);
      const address = listing ? propertyById.get(listing.property_id)?.address_line ?? deal.id.slice(0, 8) : deal.id.slice(0, 8);
      return {
        dealId: deal.id,
        address,
        activityEvents: (eventsByDeal.get(deal.id) ?? []).length,
        activityTasks: tasksByDeal.get(deal.id) ?? 0,
      };
    });

    const closedDeals = (deals ?? []).filter((d) => d.state === "post_close");
    const closeDays: number[] = [];
    for (const deal of closedDeals) {
      const listing = (listings ?? []).find((l) => l.id === deal.listing_id);
      const liveAt = (eventsByDeal.get(deal.id) ?? []).find(
        (e) => e.type === "listing.published" || e.type === "deal.live",
      )?.created_at;
      const closedAt = (eventsByDeal.get(deal.id) ?? []).find((e) => e.type === "deal.closed")?.created_at;
      const span = daysBetween(liveAt ?? listing?.created_at, closedAt ?? deal.updated_at);
      if (span != null) closeDays.push(span);
    }

    let grossFeesCents = 0;
    for (const row of money ?? []) {
      if (row.kind === "platform_fee" || row.kind === "buyer_agent_fee") {
        grossFeesCents += Number(row.amount_cents ?? 0);
      }
    }

    let bothSides = 0;
    let consented = 0;
    for (const deal of deals ?? []) {
      const parties = await loadParties(actor.admin, deal.id);
      const dealOffers = offersByDeal.get(deal.id) ?? [];
      const accepted = dealOffers.find((o) => o.status === "accepted") ?? dealOffers[0];
      if (!isBothSidesOpportunity(parties, accepted ?? null)) continue;
      bothSides += 1;
      const { data: approvals } = await actor.admin
        .from("approvals")
        .select("id")
        .eq("deal_id", deal.id)
        .eq("kind", "designated_agency")
        .eq("status", "approved")
        .limit(1);
      if (approvals && approvals.length) consented += 1;
    }

    return {
      ok: true,
      data: {
        listings: listingScores,
        deals: dealScores,
        portfolio: {
          closes: closedDeals.length,
          grossFeesCents,
          averageDaysToClose: measured(closeDays.length ? Math.round(closeDays.reduce((a, b) => a + b, 0) / closeDays.length) : null),
          consentRate: measured(bothSides ? consented / bothSides : null),
        },
      },
    };
  } catch (error) {
    return wrapError(error);
  }
}
