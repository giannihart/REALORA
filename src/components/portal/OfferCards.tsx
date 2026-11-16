"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import OfferTermsDrawer from "@/components/portal/OfferTermsDrawer";
import { DEMO_LISTING_ID } from "@/data/seed";
import { formatMoney, cn } from "@/lib/format";
import {
  agentRowLabel,
  contingencyChips,
  downPaymentDollars,
  effectiveOfferStatus,
  formatCloseLine,
  formatExpiryRelative,
  highestNet,
  isOfferExpired,
  offerNet,
  offerRead,
  sortOffers,
  strongestCertaintyLabel,
  verificationBadge,
  type OfferSort,
} from "@/lib/offers";
import { useAppData } from "@/lib/data/use-app-data";
import type { Listing, Offer, OfferStatus } from "@/lib/types";

const statusTone: Record<OfferStatus, "good" | "lime" | "warn" | "neutral" | "sold"> = {
  New: "lime",
  Viewed: "neutral",
  Countered: "warn",
  Accepted: "good",
  Declined: "sold",
  Expired: "sold",
};

const SORT_OPTIONS: { value: OfferSort; label: string; short: string }[] = [
  { value: "rank", label: "Rank (net → certainty)", short: "Rank" },
  { value: "price", label: "Price", short: "Price" },
  { value: "net", label: "Net", short: "Net" },
  { value: "close", label: "Closing date", short: "Close" },
];

export function OffersBoard() {
  const offers = useAppData((s) => s.offers);
  const deal = useAppData((s) => s.deal);
  const listings = useAppData((s) => s.listings);
  const user = useAppData((s) => s.user);
  const markOfferViewed = useAppData((s) => s.markOfferViewed);
  const requestOfferExtension = useAppData((s) => s.requestOfferExtension);

  const [sort, setSort] = useState<OfferSort>("rank");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const mine = new Set(
      listings.filter((l) => l.sellerId && l.sellerId === user.id).map((l) => l.id),
    );
    return offers.filter(
      (o) =>
        o.listingId === DEMO_LISTING_ID ||
        o.listingId === deal.listingId ||
        (mine.size > 0 && mine.has(o.listingId)),
    );
  }, [offers, deal.listingId, listings, user.id]);

  const primaryListingId =
    rows[0]?.listingId ??
    listings.find((l) => l.sellerId === user.id)?.id ??
    deal.listingId;
  const listing = listings.find((l) => l.id === primaryListingId);

  const ranked = useMemo(() => sortOffers(rows, sort, listing), [rows, sort, listing]);
  const live = ranked.filter((o) => !isOfferExpired(o));
  const expired = ranked.filter((o) => isOfferExpired(o));
  const open = ranked.find((o) => o.id === openId) ?? null;
  const topNet = highestNet(rows, listing);
  const strongest = strongestCertaintyLabel(rows);

  function openTerms(offer: Offer) {
    setOpenId(offer.id);
    if (offer.status === "New") {
      void Promise.resolve(markOfferViewed(offer.id)).catch(() => undefined);
    }
  }

  return (
    <div className="space-y-5">
      <Header />

      <section className="relative z-20 rounded-2xl border border-line bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">
              Offer comparison
            </p>
            <h3 className="mt-1 font-semibold text-forest">
              {rows.length
                ? "Ranked by estimated net, then certainty"
                : "Waiting for the first offer"}
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted">
              {rows.length
                ? "Highest purchase price is not necessarily the strongest offer."
                : "The moment an offer lands, it's here — verified, ranked, and we'll notify you."}
            </p>
          </div>
          {rows.length ? (
            <div className="relative z-30 flex flex-wrap items-center gap-2">
              <SortDropdown value={sort} onChange={setSort} />
            </div>
          ) : (
            <Button variant="outline" href="/portal/seller/listing" className="rounded-full px-4">
              View listing
            </Button>
          )}
        </div>
        <div className="rounded-b-2xl border-t border-line bg-warm/40">
          <dl className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-4 py-3.5 sm:px-5">
              <dt className="text-xs font-medium text-muted">
                Offers
              </dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight text-forest">
                {live.length}
              </dd>
            </div>
            <div className="px-4 py-3.5 sm:px-5">
              <dt className="text-xs font-medium text-muted">
                Highest net
              </dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight text-forest">
                {topNet != null ? formatMoney(topNet) : "—"}
              </dd>
            </div>
            <div className="px-4 py-3.5 sm:px-5">
              <dt className="text-xs font-medium text-muted">
                Strongest certainty
              </dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight text-forest">
                {strongest ?? "—"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {rows.length ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {live.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                peers={rows}
                listing={listing}
                onReview={() => openTerms(o)}
              />
            ))}
          </div>

          {expired.length ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 pt-1">
                <div className="h-px flex-1 bg-line" />
                <p className="text-xs font-medium text-muted">
                  Expired
                </p>
                <div className="h-px flex-1 bg-line" />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {expired.map((o) => (
                  <OfferCard
                    key={o.id}
                    offer={o}
                    peers={rows}
                    listing={listing}
                    muted
                    onReview={() => openTerms(o)}
                    onExtend={() => {
                      void Promise.resolve(requestOfferExtension(o.id))
                        .then(() =>
                          toast("Extension requested — your AE will chase the buyer."),
                        )
                        .catch(() => undefined);
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {open ? (
            <OfferTermsDrawer
              offer={open}
              listing={listing}
              peers={rows}
              onClose={() => setOpenId(null)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">Offers</h1>
    </div>
  );
}

/** Buy-filters style pill dropdown: rounded-full trigger, overlay dismiss, Escape. */
function SortDropdown({
  value,
  onChange,
}: {
  value: OfferSort;
  onChange: (value: OfferSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Sort offers"
        title="Sort"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 shrink-0 items-center justify-between gap-1 rounded-full border px-3 text-sm text-forest",
          "border-line bg-white hover:bg-warm",
          open && "bg-warm",
        )}
      >
        <span className="min-w-0 truncate">{current.short}</span>
        <ChevronDown size={14} className={cn("shrink-0 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            className="absolute right-0 top-11 z-50 w-[min(calc(100vw-2rem),14rem)] rounded-2xl border border-line bg-white p-2 shadow-xl"
          >
            <p className="px-2.5 pb-1.5 pt-1 text-xs font-medium text-muted">
              Sort by
            </p>
            <div className="flex flex-col gap-0.5">
              {SORT_OPTIONS.map((opt) => {
                const active = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full rounded-xl px-2.5 py-2 text-left text-sm font-medium transition",
                      active
                        ? "bg-forest text-cream"
                        : "text-forest hover:bg-warm",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function OfferCard({
  offer,
  peers,
  listing,
  muted,
  onReview,
  onExtend,
}: {
  offer: Offer;
  peers: Offer[];
  listing: Listing | undefined;
  muted?: boolean;
  onReview: () => void;
  onExtend?: () => void;
}) {
  const status = effectiveOfferStatus(offer);
  const math = offerNet(offer, listing);
  const expired = isOfferExpired(offer);

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-line bg-white",
        muted && "opacity-60",
      )}
    >
      <div className="flex flex-1 flex-col px-5 py-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold tracking-tight text-forest">
            {offer.buyerLabel}
          </p>
          <Badge tone={statusTone[status]}>{status}</Badge>
        </div>

        <div className="mt-4">
          <p className="text-2xl font-semibold tracking-tight text-forest sm:text-[1.75rem]">
            {formatMoney(offer.price)}
          </p>
          <p className="mt-1.5 text-sm leading-5">
            <span className="text-muted">You net ≈ </span>
            <span className="font-semibold text-forest">{formatMoney(math.net)}</span>
          </p>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
          <Term label="Certainty" value={verificationBadge(offer)} />
          <Term label="Financing" value={offer.financing} />
          <Term
            label="Down"
            value={`${offer.downPercent}% · ${formatMoney(downPaymentDollars(offer))}`}
          />
          <Term label="Deposit" value={formatMoney(offer.emd)} />
          <Term label="Close" value={formatCloseLine(offer.closeDate)} className="col-span-2" />
          <div className="col-span-2">
            <dt className="text-xs font-medium text-muted">
              Contingencies
            </dt>
            <dd className="mt-1.5 flex flex-wrap gap-1">
              {contingencyChips(offer).map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-warm px-2.5 py-0.5 text-xs font-medium text-forest"
                >
                  {c}
                </span>
              ))}
            </dd>
          </div>
          <Term
            label="Buyer's agent"
            value={agentRowLabel(offer, listing)}
            className="col-span-2"
          />
        </dl>

        <details className="group mt-5 overflow-hidden rounded-2xl border border-line bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 bg-warm/40 px-3 py-2.5 text-xs font-semibold text-forest [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">View Realora&apos;s Breakdown</span>
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 text-muted transition group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="border-t border-line bg-white px-3 py-2.5">
            <p className="text-xs leading-5 text-forest/75">
              {offerRead(offer, peers, listing)}
            </p>
          </div>
        </details>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line bg-warm/40 px-5 py-3.5">
        <p className="text-xs font-medium text-forest/70">{formatExpiryRelative(offer.expires)}</p>
        {expired ? (
          <Button variant="outline" className="h-9 shrink-0 rounded-xl px-3 text-xs" onClick={onExtend}>
            Ask for an extension
          </Button>
        ) : (
          <Button variant="outline" className="h-9 shrink-0 rounded-xl px-3 text-xs" onClick={onReview}>
            Review full terms
          </Button>
        )}
      </div>
    </article>
  );
}

function Term({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold leading-5 text-forest">{value}</dd>
    </div>
  );
}

