"use client";

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { PropertyCard } from "@/components/marketplace/PropertyCard";
import { HOMEPAGE_SHOWCASE } from "@/components/public/HomeHero";
import { DEMO_LISTING_ID, listings, offers } from "@/data/seed";
import { offerNet, sortOffers, verificationBadge } from "@/lib/offers";
import { formatMoney, formatPrice, cn } from "@/lib/format";
import {
  BUYING_POWER_DEFAULTS,
  computeBuyingPower,
} from "@/lib/buying-power";

const demoListing = listings.find((l) => l.id === DEMO_LISTING_ID)!;
const demoOffers = offers.filter((o) => o.listingId === DEMO_LISTING_ID);

export function OfferComparisonStory({ className }: { className?: string }) {
  const ranked = sortOffers(demoOffers, "rank", demoListing).slice(0, 3);

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-line bg-white shadow-lg", className)}>
      <div className="border-b border-line px-4 py-3">
        <p className="text-xs font-medium text-muted">
          Offer comparison
        </p>
        <p className="mt-1 text-sm font-semibold text-forest">
          {ranked.length} live · ranked by net
        </p>
      </div>
      <ul>
        {ranked.map((offer, i) => {
          const net = offerNet(offer, demoListing);
          return (
            <li
              key={offer.id}
              className={cn(
                "flex items-start justify-between gap-3 px-4 py-3",
                i > 0 && "border-t border-line",
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-forest">
                  {offer.buyerLabel}
                </p>
                <p className="mt-0.5 text-xs text-muted">{verificationBadge(offer)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="nums text-sm font-semibold text-forest">
                  {formatMoney(offer.price)}
                </p>
                <p className="nums mt-0.5 text-xs text-muted">
                  Net {formatMoney(net.net)}
                </p>
                {i === 0 ? (
                  <span className="mt-1 inline-block">
                    <Badge tone="lime">Strongest</Badge>
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BuyingPowerStory({ className }: { className?: string }) {
  const result = computeBuyingPower(BUYING_POWER_DEFAULTS);

  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-white px-4 py-4 shadow-lg",
        className,
      )}
    >
      <p className="text-xs font-medium text-muted">
        Estimated buying power
      </p>
      <p className="nums mt-2 text-3xl font-semibold tracking-tight text-forest">
        {formatMoney(result.maxHomePrice)}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted">
        Realora estimate until a lender letter is confirmed on platform.
      </p>
    </div>
  );
}

export function IntakeStepsStory({ className }: { className?: string }) {
  return (
    <TimelineStory
      className={className}
      items={[
        { title: "Address", status: "Now" },
        { title: "ACRIS summary", status: "Next" },
        { title: "Listing agreement", status: "Next" },
        { title: "Schedule media", status: "Later" },
      ]}
    />
  );
}

export function NetKeepStory({ className }: { className?: string }) {
  const price = 4_190_000;
  const keep = Math.round(price * 0.045);
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-white px-4 py-4 shadow-lg",
        className,
      )}
    >
      <p className="text-xs font-medium text-muted">
        You keep more
      </p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 font-semibold tracking-tight">
        <span className="rounded-xl bg-lime px-3 py-1 text-2xl leading-none">
          {formatPrice(keep)}
        </span>
      </p>
      <p className="mt-2 text-sm text-forest">vs traditional ~5.5%</p>
    </div>
  );
}

export function VerifyStory({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-white shadow-lg",
        className,
      )}
    >
      {[
        { t: "Identity", s: "Staff confirmed" },
        { t: "Funds", s: "Letter on file" },
        { t: "Ownership", s: "Intake checked" },
      ].map((row, i) => (
        <div
          key={row.t}
          className={cn(
            "flex items-center justify-between px-4 py-3 text-sm",
            i > 0 && "border-t border-line",
          )}
        >
          <span className="font-medium text-forest">{row.t}</span>
          <span className="text-xs text-muted">{row.s}</span>
        </div>
      ))}
    </div>
  );
}

export function EscrowStory({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-white px-4 py-4 text-sm leading-6 shadow-lg",
        className,
      )}
    >
      <p className="font-semibold text-forest">On the record</p>
      <p className="mt-2 text-muted">
        Attorneys draft. Deposit sits in the seller&apos;s attorney&apos;s escrow —
        never Realora.
      </p>
    </div>
  );
}

export function TimelineStory({
  className,
  items,
}: {
  className?: string;
  items: readonly { title: string; status: string }[];
}) {
  let upcomingIndex = 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-white shadow-lg",
        className,
      )}
    >
      {items.map((row, i) => {
        const key = row.status.toLowerCase();
        const complete = key === "done";
        const current = key === "now";
        const upcoming =
          key === "next" ||
          key === "later" ||
          key === "up next" ||
          key.startsWith("in ");
        const thisUpcoming = upcoming ? upcomingIndex++ : -1;
        const hasExplicitNow = items.some((r) => r.status.toLowerCase() === "now");
        const leadUpcoming = upcoming && !hasExplicitNow && thisUpcoming === 0;
        const label = complete
          ? "Done"
          : current || leadUpcoming
            ? "Now"
            : thisUpcoming === 1 && !hasExplicitNow
              ? "Up next"
              : thisUpcoming > 0
                ? `In ${thisUpcoming + 1} steps`
                : "Up next";

        return (
          <div
            key={row.title}
            className={cn(
              "flex items-center justify-between gap-3 px-4 py-3 text-sm",
              i > 0 && "border-t border-line",
            )}
          >
            <span className="font-medium text-forest">{row.title}</span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                complete && "bg-warm text-forest",
                (current || leadUpcoming) && "bg-forest text-cream",
                upcoming && !leadUpcoming && "bg-lime text-forest",
                !complete && !current && !upcoming && "bg-warm text-forest",
              )}
            >
              {complete ? <Check size={12} strokeWidth={2.5} /> : null}
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function MortgageStory({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-white shadow-lg",
        className,
      )}
    >
      {["Shopping range", "Monthly payment", "Cash to close"].map((label, i) => (
        <div
          key={label}
          className={cn("px-4 py-3 text-sm font-medium text-forest", i > 0 && "border-t border-line")}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

export function ListingLiveStory({ className }: { className?: string }) {
  const base = HOMEPAGE_SHOWCASE[0];
  if (!base) return null;
  const listing = { ...base, badge: "New Listing" as const };
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-line bg-white shadow-lg [&_article]:border-0 [&_article]:shadow-none",
        className,
      )}
    >
      <PropertyCard listing={listing} linked={false} />
    </div>
  );
}
