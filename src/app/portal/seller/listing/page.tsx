"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalSidebar";
import { Timeline, type TimelineStage } from "@/components/portal/Timeline";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { cn, formatPrice } from "@/lib/format";
import { DEMO_LISTING_ID } from "@/data/seed";
import { useAppData } from "@/lib/data/use-app-data";
import { isSupabaseDataMode } from "@/lib/data/mode";
import {
  getListingAttentionAction,
  type ListingAttentionStats,
} from "@/lib/actions/listing-attention";
import { toast } from "sonner";

function ListingManagerInner() {
  const params = useSearchParams();
  const listings = useAppData((s) => s.listings);
  const deal = useAppData((s) => s.deal);
  const user = useAppData((s) => s.user);
  const updateListing = useAppData((s) => s.updateListing);
  const toggleBuyerAgentFee = useAppData((s) => s.toggleBuyerAgentFee);
  const withdrawListing = useAppData((s) => s.withdrawListing);

  const mine = useMemo(() => {
    if (!isSupabaseDataMode() || !user.id) return [];
    return listings.filter((l) => l.sellerId === user.id);
  }, [listings, user.id]);

  const activeMine = useMemo(
    () =>
      mine.filter((l) => {
        const s = (l.status ?? "").toLowerCase();
        return s !== "closed" && s !== "withdrawn";
      }),
    [mine],
  );

  const requested = params.get("listing");
  // One sell at a time — prefer the seller's single active listing.
  const listing =
    activeMine[0] ??
    listings.find((l) => l.id === requested && (!user.id || l.sellerId === user.id)) ??
    listings.find((l) => l.status === "draft" && (!user.id || l.sellerId === user.id)) ??
    listings.find((l) => l.id === deal.listingId) ??
    listings.find((l) => l.id === DEMO_LISTING_ID);

  const [changeOpen, setChangeOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [requestedPrice, setRequestedPrice] = useState(String(listing?.price ?? 0));
  const isBroker = useAppData((s) => s.isBroker);
  const [mediaCost, setMediaCost] = useState(String((listing?.mediaCostCents ?? 0) / 100));
  const [campaignCost, setCampaignCost] = useState(String((listing?.campaignCostCents ?? 0) / 100));

  const photos = listing?.photos ?? [];
  const draft = listing?.status === "draft";
  const published =
    listing?.status === "live" ||
    listing?.status === "in_contract" ||
    listing?.status === "closed";
  const at = listing?.syndication[0]?.at;
  const daysOnMarket = useMemo(() => {
    if (!at) return 0;
    const a = new Date(`${at.slice(0, 10)}T00:00:00`).getTime();
    const b = new Date("2026-10-20T00:00:00").getTime();
    return Math.max(0, Math.round((b - a) / 86_400_000));
  }, [at]);

  const [attention, setAttention] = useState<ListingAttentionStats | null>(null);
  const [attentionStatus, setAttentionStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [attentionRetry, setAttentionRetry] = useState(0);

  const listingId = listing?.id;
  useEffect(() => {
    if (!listingId) {
      setAttention(null);
      setAttentionStatus("idle");
      return;
    }
    let cancelled = false;
    setAttentionStatus("loading");
    void getListingAttentionAction(listingId).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setAttention(null);
        setAttentionStatus("error");
        return;
      }
      setAttention(res.data);
      setAttentionStatus("ok");
    });
    return () => {
      cancelled = true;
    };
  }, [listingId, attentionRetry]);

  // Legal checklist states: attention record only. Fail closed when missing.
  const agreementSigned = attention?.agreementSigned ?? false;
  const countersignPending = attention?.agreementCountersignPending ?? false;
  const brokerReviewDone = attention?.brokerReviewDone ?? false;
  const hasPhotos = attention?.hasPhotos ?? photos.length > 0;
  const buyerAgentOn = listing?.offerBuyerAgentPercent === 1;

  const views30d = attention?.views30d ?? 0;
  const saves30d = attention?.saves30d ?? 0;
  const daysOnRealora = attention?.daysOnRealora ?? (published ? daysOnMarket : 0);
  const offersCount = attention?.offersCount ?? 0;
  const viewsByDay = attention?.viewsByDay ?? [];

  const launchStages = useMemo((): TimelineStage[] => {
    if (!listing) return [];

    const mediaDone = hasPhotos || Boolean(published);
    const readyForBroker = mediaDone && agreementSigned;
    const readyToPublish = readyForBroker && brokerReviewDone;

    function status(
      done: boolean,
      unlocked: boolean,
    ): TimelineStage["status"] {
      if (done) return "Complete";
      if (unlocked) return "In Progress";
      return "Upcoming";
    }

    const steps: Omit<TimelineStage, "order">[] = [
      {
        id: "created",
        title: "Listing created",
        description: "Draft saved from onboarding.",
        responsibleParty: "Seller",
        status: "Complete",
      },
      {
        id: "agreement",
        title: "Listing agreement",
        description: agreementSigned
          ? countersignPending
            ? "Signed by you — brokerage countersignature in review."
            : "Signed by you."
          : "Required before publishing.",
        responsibleParty: "Seller",
        status: agreementSigned ? "Complete" : "Action Required",
        ...(agreementSigned
          ? {}
          : {
              ctaLabel: "Sign your listing agreement",
              ctaHref: "/portal/seller/documents",
            }),
      },
      {
        id: "media",
        title: "Media arranged",
        description: mediaDone
          ? "Photos and tour delivered."
          : "Photography and tour being scheduled.",
        responsibleParty: "Realora",
        status: status(mediaDone, agreementSigned || Boolean(published)),
      },
      {
        id: "broker",
        title: "Broker review",
        description: brokerReviewDone
          ? "Brokerage countersignature complete."
          : countersignPending
            ? "Brokerage countersignature in review."
            : "Broker of record countersigns before go-live.",
        responsibleParty: "Realora",
        status: status(brokerReviewDone, readyForBroker),
      },
      {
        id: "live",
        title: "Go live",
        description: published
          ? "Live on Realora and portals."
          : "Realora publishes when ready.",
        responsibleParty: "Realora",
        status: status(Boolean(published), readyToPublish),
      },
    ];

    return steps.map((step, i) => ({ ...step, order: i + 1 }));
  }, [listing, hasPhotos, published, agreementSigned, countersignPending, brokerReviewDone]);

  if (!listing) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">
          No listing yet
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Create a listing to manage photos, pricing, and go-live from here.
        </p>
        <div className="mt-8">
          <Button href="/sell" variant="lime">
            List a home
          </Button>
        </div>
      </div>
    );
  }

  const statusLabel =
    listing.status === "live"
      ? "For Sale"
      : listing.status === "in_contract"
        ? "Pending"
        : listing.status === "closed"
          ? "Sold"
          : listing.status === "withdrawn"
            ? "Withdrawn"
            : "Draft";

  const statusTone =
    listing.status === "live"
      ? "dark"
      : listing.status === "in_contract"
        ? "lime"
        : listing.status === "closed"
          ? "sold"
          : listing.status === "withdrawn"
            ? "neutral"
            : "dark";

  const canWithdraw =
    listing.status === "draft" || listing.status === "live";

  const sparkMax = Math.max(1, ...viewsByDay.map((d) => d.count));

  return (
    <PortalShell role="seller">
      <div className="space-y-5">
        <div>
          <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">My listing</h1>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <section
              id="listing-review-anchor"
              className="relative z-20 rounded-2xl border border-line bg-white"
            >
              <div className="px-5 py-5 sm:px-6 sm:py-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Badge tone={statusTone}>{statusLabel}</Badge>
                    <h2 className="mt-3 text-xl font-semibold tracking-tight text-forest sm:text-2xl">
                      {listing.address.replace(/#(\S+)/g, (unit) =>
                        unit.toUpperCase(),
                      )}
                    </h2>
                    <p className="mt-1.5 text-2xl font-semibold tracking-tight text-forest sm:text-[1.75rem]">
                      {formatPrice(listing.price)}
                    </p>
                  </div>
                  <Button
                    className="shrink-0 rounded-xl"
                    variant="lime"
                    href={`/listing/${listing.id}`}
                  >
                    {published ? "View live listing" : "Preview listing"}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-b-2xl border-t border-line bg-warm/40 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                  <div className="flex items-baseline gap-1.5">
                    <dt className="text-xs font-medium text-muted">
                      Beds
                    </dt>
                    <dd className="font-semibold text-forest">{listing.beds}</dd>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <dt className="text-xs font-medium text-muted">
                      Baths
                    </dt>
                    <dd className="font-semibold text-forest">{listing.baths}</dd>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <dt className="text-xs font-medium text-muted">
                      Sqft
                    </dt>
                    <dd className="font-semibold text-forest">
                      {listing.sqft.toLocaleString()}
                    </dd>
                  </div>
                  {daysOnMarket > 0 ? (
                    <div className="flex items-baseline gap-1.5">
                      <dt className="text-xs font-medium text-muted">
                        DOM
                      </dt>
                      <dd className="font-semibold text-forest">{daysOnMarket}</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="relative shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    aria-expanded={optionsOpen}
                    aria-haspopup="menu"
                    onClick={() => setOptionsOpen((o) => !o)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm font-medium text-forest transition hover:bg-warm"
                  >
                    Options
                    <ChevronDown
                      size={14}
                      className={cn("transition", optionsOpen && "rotate-180")}
                    />
                  </button>
                  {optionsOpen ? (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-30 cursor-default"
                        aria-label="Close options"
                        onClick={() => setOptionsOpen(false)}
                      />
                      <div
                        role="menu"
                        className="absolute left-auto right-0 top-full z-40 mt-1.5 w-max min-w-[14rem] rounded-2xl border border-line bg-white p-1.5 shadow-xl"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-medium text-forest transition hover:bg-warm"
                          onClick={() => {
                            setOptionsOpen(false);
                            setRequestedPrice(String(listing.price));
                            setChangeNote("");
                            setChangeOpen(true);
                          }}
                        >
                          Request a change
                        </button>
                        {canWithdraw ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-medium text-forest transition hover:bg-warm"
                            onClick={() => {
                              setOptionsOpen(false);
                              setWithdrawOpen(true);
                            }}
                          >
                            Withdraw
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="grid gap-3">
              <section className="overflow-hidden rounded-2xl border border-line bg-white">
                <div className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div>
                    <p className="text-xs font-medium text-muted">
                      Performance
                    </p>
                    <h3 className="mt-1 font-semibold text-forest">Listing activity</h3>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {published
                        ? "Buyer interest across Realora and syndicated portals."
                        : "Metrics start when this listing goes live."}
                    </p>
                  </div>
                  <Badge tone={published ? "lime" : "neutral"}>
                    {published ? "Tracking" : "Not live"}
                  </Badge>
                </div>

                {published ? (
                  <div className="border-t border-line bg-warm/40">
                    <dl className="grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
                      <div className="px-3 py-3.5 sm:px-4">
                        <dt className="text-xs font-medium text-muted">
                          Views
                        </dt>
                        <dd className="mt-1 text-xl font-semibold tracking-tight text-forest">
                          {views30d.toLocaleString()}
                        </dd>
                        {viewsByDay.length ? (
                          <div
                            className="mt-2 flex h-6 items-end gap-px"
                            aria-hidden
                          >
                            {viewsByDay.map((d) => (
                              <span
                                key={d.day}
                                className="min-w-0 flex-1 rounded-sm bg-forest/25"
                                style={{
                                  height: `${Math.max(8, Math.round((d.count / sparkMax) * 100))}%`,
                                }}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="px-3 py-3.5 sm:px-4">
                        <dt className="text-xs font-medium text-muted">
                          Saves
                        </dt>
                        <dd className="mt-1 text-xl font-semibold tracking-tight text-forest">
                          {saves30d.toLocaleString()}
                        </dd>
                      </div>
                      <div className="px-3 py-3.5 sm:px-4">
                        <dt className="text-xs font-medium text-muted">
                          Days on Realora
                        </dt>
                        <dd className="mt-1 text-xl font-semibold tracking-tight text-forest">
                          {daysOnRealora}
                        </dd>
                      </div>
                      <div className="px-3 py-3.5 sm:px-4">
                        <dt className="text-xs font-medium text-muted">
                          Offers
                        </dt>
                        <dd className="mt-1 text-xl font-semibold tracking-tight text-forest">
                          {offersCount.toLocaleString()}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
              </section>

              <section
                className={cn(
                  "overflow-hidden rounded-2xl border bg-white transition",
                  buyerAgentOn ? "border-forest" : "border-line",
                )}
              >
                <div className="px-4 py-3.5 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-forest">Buyer-agent 1%</h3>
                    <Badge tone={buyerAgentOn ? "lime" : "neutral"}>
                      {buyerAgentOn ? "On" : "Off"}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-muted">
                    Optional offer to agent-represented buyers. Realora still collects 1% —
                    this does not change your fee.
                  </p>
                </div>
                <div
                  className={cn(
                    "border-t px-4 py-3 sm:px-5",
                    buyerAgentOn
                      ? "border-lime bg-lime"
                      : "border-line bg-warm/40",
                  )}
                >
                  <Checkbox
                    checked={buyerAgentOn}
                    onChange={(next) => toggleBuyerAgentFee(listing.id, next)}
                    className="gap-2.5 text-sm font-medium"
                  >
                    Offer 1% to a buyer&apos;s agent
                  </Checkbox>
                  <p className="mt-2 pl-7 text-[11px] leading-4 text-muted">
                    {buyerAgentOn
                      ? "Shown on the listing as buyer-agent compensation available."
                      : "Turn on to widen reach with agents shopping for clients."}
                  </p>
                </div>
              </section>
            </div>
          </div>

          <div className="space-y-4">
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-forest">Listing launch</h3>
                {attentionStatus === "error" ||
                (attentionStatus !== "loading" && !attention) ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-forest underline decoration-forest/40 underline-offset-2 transition hover:decoration-forest"
                    onClick={() => setAttentionRetry((n) => n + 1)}
                  >
                    Retry checklist status
                  </button>
                ) : null}
              </div>
              {attentionStatus === "loading" && !attention ? (
                <p className="text-xs text-muted">Confirming agreement status…</p>
              ) : null}
              {attentionStatus === "error" ? (
                <p className="text-xs text-muted">
                  Agreement status could not be confirmed. Steps below stay
                  unchecked until status loads.
                </p>
              ) : null}
              <Timeline stages={launchStages} readOnly />
            </section>
          </div>
        </div>
      </div>

      <Modal
        open={changeOpen}
        title="Request a change"
        onClose={() => setChangeOpen(false)}
        className="bg-white"
      >
        <p className="text-sm leading-6 text-forest/75">
          Tell Realora what to update. Your listing broker will review and apply changes —
          nothing goes live until confirmed.
        </p>
        <label className="mt-4 block text-sm">
          Requested asking price
          <input
            type="text"
            inputMode="numeric"
            value={
              requestedPrice
                ? `$${Number(requestedPrice).toLocaleString("en-US")}`
                : ""
            }
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              setRequestedPrice(digits);
            }}
            className="mt-1 w-full rounded-xl border border-line px-3 py-2"
          />
        </label>
        <label className="mt-4 block text-sm">
          What should change?
          <textarea
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            rows={4}
            placeholder="Price, copy, photos…"
            className="mt-1 w-full rounded-xl border border-line px-3 py-2"
          />
        </label>
        {isBroker && isSupabaseDataMode() ? (
          <>
            <label className="mt-4 block text-sm">
              Media cost (USD)
              <input
                type="number"
                value={mediaCost}
                onChange={(e) => setMediaCost(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line px-3 py-2"
              />
            </label>
            <label className="mt-4 block text-sm">
              Campaign cost (USD)
              <input
                type="number"
                value={campaignCost}
                onChange={(e) => setCampaignCost(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line px-3 py-2"
              />
            </label>
          </>
        ) : null}
        <div className="mt-5 flex gap-2">
          <Button
            variant="lime"
            disabled={!changeNote.trim()}
            onClick={() => {
              if (isBroker && isSupabaseDataMode()) {
                updateListing(listing.id, {
                  mediaCostCents: Math.round(Number(mediaCost || 0) * 100),
                  campaignCostCents: Math.round(Number(campaignCost || 0) * 100),
                });
              }
              toast("Change request sent to Realora.");
              setChangeOpen(false);
              setChangeNote("");
            }}
          >
            Submit request
          </Button>
          <Button variant="outline" onClick={() => setChangeOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>

      <Modal
        open={withdrawOpen}
        title="Withdraw this listing?"
        onClose={() => setWithdrawOpen(false)}
        className="bg-white"
      >
        <p className="text-sm leading-6 text-forest/75">
          The listing will be marked withdrawn and removed from buyer search and its
          public page. Your deal timeline is left untouched.
        </p>
        <div className="mt-5 flex gap-2">
          <Button
            variant="lime"
            onClick={() => {
              void Promise.resolve(withdrawListing?.(listing.id))
                .then(() => {
                  toast("Listing withdrawn.");
                  setWithdrawOpen(false);
                })
                .catch(() => undefined);
            }}
          >
            Confirm withdraw
          </Button>
          <Button variant="outline" onClick={() => setWithdrawOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </PortalShell>
  );
}

export default function ListingManagerPage() {
  return (
    <Suspense>
      <ListingManagerInner />
    </Suspense>
  );
}
