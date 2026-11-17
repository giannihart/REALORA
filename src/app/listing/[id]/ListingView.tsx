"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, Heart, Share } from "lucide-react";
import { toast } from "sonner";
import { GoogleMap } from "@/components/map/GoogleMap";
import { IdentityBlock } from "@/components/compliance/IdentityBlock";
import { ListingGallery } from "@/components/property/ListingGallery";
import { MortgageCalculator } from "@/components/property/MortgageCalculator";
import { NearbyHomes } from "@/components/property/NearbyHomes";
import { PriceHistory } from "@/components/property/PriceHistory";
import { PublicTaxHistory } from "@/components/property/PublicTaxHistory";
import { OfferWizard } from "@/components/public/OfferWizard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RangeSlider } from "@/components/ui/RangeSlider";
import { formatNumber, formatPrice } from "@/lib/format";
import { isSupabaseDataMode } from "@/lib/data/mode";
import { useAppData } from "@/lib/data/use-app-data";
import type { Listing } from "@/lib/types";

function viewerKey(): string {
  if (typeof window === "undefined") return "ssr";
  const storageKey = "realora.viewer";
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(storageKey, next);
    return next;
  } catch {
    return `v-${Date.now()}`;
  }
}

const ABOUT_WORD_CUTOFF = 80;

function aboutParagraphs(listing: Listing) {
  const lead = listing.about.map((paragraph) => paragraph.trim()).filter(Boolean);

  const kind = listing.type.toLowerCase();
  const beds =
    listing.beds === 1 ? "one bedroom" : `${listing.beds} bedrooms`;
  const baths =
    listing.baths % 1 === 0
      ? `${listing.baths} full baths`
      : `${listing.baths} baths`;
  const layout =
    listing.type === "Townhouse" || listing.type === "House"
      ? "Rooms stack over multiple floors instead of a single apartment plan. The parlor or main living level is meant for gathering; bedrooms sit on quieter floors above or below. Stairs, ceiling height, and garden light do more of the work than a long hallway."
      : listing.type === "Loft"
        ? "The plan is more open than a conventional apartment: a long room for living and dining, a kitchen that can hold a real table, and bedrooms that close off from the main volume. Ceiling height and window bays are the thing to notice in the photos."
        : "The apartment reads as a proper residence rather than rooms carved out of a studio. Living rooms sit together; bedrooms are arranged away from the entry so the public rooms can stay on for guests.";
  const outdoor =
    listing.lotSqft > 0
      ? `The facts file lists a lot of about ${formatNumber(listing.lotSqft)} square feet. Outdoor space — garden, terrace, or roof as photographed — is part of how the house lives in warm weather. Planting, drainage, and any pool equipment in the photos are staging; confirm what conveys.`
      : "There is no private lot in the facts. Outdoor space, if any, is a terrace, balcony, or a building amenity rather than a garden of your own. Treat every outdoor photograph as a tour of this listing, not a promise about the roof or courtyard next door.";

  return [
    ...lead,
    `Inside, this ${kind} is listed as ${beds} and ${baths} across about ${formatNumber(listing.sqft)} square feet. ${layout} Closets, pantries, and any staff or guest rooms are as photographed — count them on a walkthrough, not from this paragraph.`,
    `${listing.address} is in ${listing.neighborhood}, ${listing.borough}${listing.zip ? `, ${listing.zip}` : ""}. The block is the one on the map pin: a walk to daily errands, a longer walk or a short ride to the park, and a street that holds after dark. School zones, noise, and construction on neighboring lots change; confirm locally before you rely on any of that.`,
    `The building dates to ${listing.yearBuilt}. Heating is listed as ${listing.heating}. Annual taxes in the file are ${formatPrice(listing.taxes)}; that figure should be checked against the current bill and any pending assessment. ${outdoor}`,
    "Day to day, the house runs from kitchen to living room and back. Morning light in the main room, a quieter bedroom wing, and enough storage that you are not living out of bags. Floors, millwork, appliances, and lighting in the gallery are as staged for this listing. Ask what stays, what is leased, and what the seller intends to take.",
    "Use the facts below for beds, baths, square footage, year built, and neighborhood. Days on Realora, views, and saves on this page reflect activity on the listing, not a market report. Offer-guide numbers are estimates only. Walk the block, confirm listing status, and speak with counsel and licensed inspectors before you rely on any figure.",
  ];
}

function AboutHome({ listing }: { listing: Listing }) {
  const [expanded, setExpanded] = useState(false);
  const paragraphs = useMemo(() => aboutParagraphs(listing), [listing]);
  const words = paragraphs.join(" ").split(/\s+/).filter(Boolean);
  const needsCutoff = words.length > ABOUT_WORD_CUTOFF;
  const collapsedText = `${words.slice(0, ABOUT_WORD_CUTOFF).join(" ")}…`;

  return (
    <>
      {expanded || !needsCutoff ? (
        paragraphs.map((paragraph) => (
          <p
            key={paragraph.slice(0, 48)}
            className="mt-3 text-[15px] leading-7 text-forest/85"
          >
            {paragraph}
          </p>
        ))
      ) : (
        <p className="mt-3 text-[15px] leading-7 text-forest/85">{collapsedText}</p>
      )}
      {needsCutoff ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-2 text-sm font-medium text-forest underline decoration-forest/30 underline-offset-4 hover:decoration-forest"
        >
          {expanded ? "See less" : "See more"}
        </button>
      ) : null}
    </>
  );
}

function statusLabel(listing: Listing) {
  if (listing.status === "in_contract") return "Pending";
  if (listing.status === "closed") return "Sold";
  return "For Sale";
}

/** Days since real created/published timestamp. Null when no timestamp exists. */
function daysOnMarket(listing: Listing): number | null {
  const at = listing.createdAt ?? listing.syndication.find((s) => s.at)?.at;
  if (!at) return null;
  const day = at.slice(0, 10);
  const a = new Date(`${day}T00:00:00`).getTime();
  if (Number.isNaN(a)) return null;
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function StatHint({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="group/hint relative inline-block">
      <span
        tabIndex={0}
        className="cursor-help text-[15px] text-muted underline decoration-muted/70 underline-offset-[3px] outline-none"
      >
        {label}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max -translate-x-1/2 rounded-xl border border-line bg-white px-3.5 py-2.5 text-left text-xs leading-4 text-forest shadow-sm group-hover/hint:block group-focus-within/hint:block"
      >
        {hint}
      </span>
    </span>
  );
}

export function ListingView({ id, initial }: { id: string; initial?: Listing | null }) {
  const listings = useAppData((s) => s.listings);
  const listing = useAppData((s) => initial ?? s.listings.find((l) => l.id === id));
  const savedIds = useAppData((s) => s.savedListingIds);
  const saved = savedIds.includes(id);
  const toggleSave = useAppData((s) => s.toggleSaved);
  const [wizard, setWizard] = useState(false);
  const [attention, setAttention] = useState<{
    views30d: number;
    saves30d: number;
  } | null>(null);

  useEffect(() => {
    if (!listing || !isSupabaseDataMode()) return;
    if (listing.status !== "live" && listing.status !== "in_contract") return;
    let cancelled = false;
    void import("@/lib/actions/listing-attention").then(({ recordListingViewedAction }) => {
      if (cancelled) return;
      void recordListingViewedAction(listing.id, viewerKey());
    });
    return () => {
      cancelled = true;
    };
  }, [listing?.id, listing?.status]);

  useEffect(() => {
    if (!listing) return;
    if (!isSupabaseDataMode()) {
      setAttention({ views30d: 0, saves30d: 0 });
      return;
    }
    let cancelled = false;
    void import("@/lib/actions/listing-attention").then(({ getPublicListingAttentionAction }) => {
      void getPublicListingAttentionAction(listing.id).then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setAttention({ views30d: res.data.views30d, saves30d: res.data.saves30d });
        } else {
          setAttention({ views30d: 0, saves30d: 0 });
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [listing?.id]);

  if (!listing) {
    return (
      <div className="p-10 text-center">
        <p>This listing could not be found.</p>
        <Button href="/buy" className="mt-4">
          Back to search
        </Button>
      </div>
    );
  }

  const labels = listing.badge ? [listing.badge] : [];
  const amenities = listing.stagingLabels ?? [];
  const dom = daysOnMarket(listing);
  const views = attention?.views30d ?? null;
  const saves = attention?.saves30d ?? null;

  return (
    <div className="bg-cream">
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-3">
        <Button
          href="/buy"
          variant="ghost"
          className="mb-3 h-9 px-2.5 text-forest"
        >
          <ChevronLeft size={16} strokeWidth={2} />
          Back to search
        </Button>
        <ListingGallery
          images={listing.photos}
          title={listing.title}
          coverOnly={listing.status === "closed"}
        />

        <div className="mt-6 grid items-start gap-6 md:grid-cols-[1.55fr_1fr]">
          <div>
            <div className="flex flex-wrap gap-2">
              {labels.map((l) => (
                <Badge key={l} tone={l === "Price Cut" ? "dark" : "lime"}>
                  {l}
                </Badge>
              ))}
              <Badge tone={listing.status === "closed" ? "sold" : "neutral"}>
                {statusLabel(listing)}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
                  {formatPrice(listing.price)}
                </h1>
                <p className="mt-2 text-base text-forest/80">
                  {listing.address}, {listing.city}, {listing.state}
                  {listing.zip ? ` ${listing.zip}` : ""}
                </p>
                <IdentityBlock className="mt-2 text-xs text-muted" />
              </div>
              <dl className="flex shrink-0 divide-x divide-line">
                <Stat value={formatListingStat(listing.beds)} label="beds" />
                <Stat value={formatListingStat(listing.baths)} label="baths" />
                <Stat
                  value={listing.sqft ? formatNumber(listing.sqft) : "--"}
                  label="sqft"
                />
              </dl>
            </div>

            <section className="mt-10">
              <h2 className="text-xl font-semibold tracking-tight text-forest">
                About this home
              </h2>
              <AboutHome listing={listing} />

              <h3 className="mt-8 text-base font-semibold text-forest">Features</h3>
              <ul className="mt-3 grid gap-2 text-sm text-forest/85 sm:grid-cols-2">
                {amenities.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-forest" />
                    {f}
                  </li>
                ))}
              </ul>

              <h3 className="mt-8 text-base font-semibold text-forest">Amenities</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <li
                    key={a}
                    className="rounded-full border border-line bg-white px-3 py-1 text-xs text-forest"
                  >
                    {a}
                  </li>
                ))}
              </ul>

              <h3 className="mt-8 text-base font-semibold text-forest">
                Property facts
              </h3>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <Fact label="Type" value={listing.type} />
                <Fact label="Status" value={statusLabel(listing)} />
                <Fact label="Year built" value={String(listing.yearBuilt)} />
                <Fact
                  label="Living area"
                  value={`${formatNumber(listing.sqft)} sqft`}
                />
                {listing.lotSqft ? (
                  <Fact
                    label="Lot size"
                    value={`${formatNumber(listing.lotSqft)} sqft`}
                  />
                ) : null}
                {dom != null ? (
                  <Fact label="Days on market" value={String(dom)} />
                ) : null}
                <Fact label="Neighborhood" value={listing.neighborhood} />
                <Fact label="HOA" value="None" />
              </dl>
            </section>

            <section className="mt-12">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                {dom != null ? (
                  <p className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tracking-tight text-forest tabular-nums">
                      {formatNumber(dom)}
                    </span>
                    <span className="text-[15px] text-muted">
                      {dom === 1 ? "day" : "days"} on Realora
                    </span>
                  </p>
                ) : null}
                {views != null ? (
                  <>
                    {dom != null ? (
                      <span
                        className="hidden h-4 w-px self-center bg-line sm:block"
                        aria-hidden
                      />
                    ) : null}
                    <p className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-semibold tracking-tight text-forest tabular-nums">
                        {formatNumber(views)}
                      </span>
                      <StatHint label="views" hint="Total views in last 30 days." />
                    </p>
                  </>
                ) : null}
                {saves != null ? (
                  <>
                    {dom != null || views != null ? (
                      <span
                        className="hidden h-4 w-px self-center bg-line sm:block"
                        aria-hidden
                      />
                    ) : null}
                    <p className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-semibold tracking-tight text-forest tabular-nums">
                        {formatNumber(saves)}
                      </span>
                      <StatHint label="saves" hint="Total saves in last 30 days." />
                    </p>
                  </>
                ) : null}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-xl font-semibold tracking-tight text-forest">
                Location
              </h2>
              <p className="mt-1 text-sm text-muted">
                {listing.address}, {listing.city}, {listing.state}
                {listing.zip ? ` ${listing.zip}` : ""}
              </p>
              <div className="relative mt-4 aspect-[16/9] overflow-hidden rounded-2xl border border-line bg-sand">
                <GoogleMap listings={[listing]} single className="absolute inset-0" />
              </div>
            </section>

            <PriceHistory listing={listing} />
            <PublicTaxHistory listing={listing} />

            <section className="mt-12">
              <h2 className="mb-4 text-xl font-semibold tracking-tight text-forest">
                Monthly payment
              </h2>
              <MortgageCalculator
                price={listing.price}
                annualTaxes={listing.taxes}
                hoaMonthly={
                  listing.type === "Condo" || listing.type === "Loft"
                    ? Math.round(listing.sqft * 0.85)
                    : 0
                }
              />
            </section>
          </div>

          <aside className="md:sticky md:top-20 md:self-start">
            <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              {listing.status === "closed" ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-base font-semibold tracking-tight text-forest">Sold</p>
                    <div className="flex gap-2">
                      <ShareListingButton listing={listing} />
                      <SaveListingButton
                        saved={saved}
                        onToggle={() => toggleSave(listing.id)}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    This home has closed. The price shown is the recorded sale.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Button
                      variant="lime"
                      className="flex-1"
                      onClick={() => setWizard(true)}
                    >
                      Buy now
                    </Button>
                    <ShareListingButton listing={listing} />
                    <SaveListingButton
                      saved={saved}
                      onToggle={() => toggleSave(listing.id)}
                    />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted">
                    Purchase this home today, save thousands on real estate agent fees.
                  </p>
                </>
              )}
            </div>

            {listing.status === "closed" ? null : (
              <OfferGuide listPrice={listing.price} daysOnMarket={dom} />
            )}
          </aside>
        </div>

        <NearbyHomes
          listing={listing}
          listings={listings}
          savedIds={savedIds}
          onSave={toggleSave}
        />
      </div>
      {wizard ? (
        <OfferWizard listing={listing} open={wizard} onOpenChange={setWizard} />
      ) : null}
    </div>
  );
}

function IconCircleButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-line p-2.5 hover:bg-warm"
      aria-label={label}
    >
      {children}
    </button>
  );
}

function SaveListingButton({
  saved,
  onToggle,
}: {
  saved: boolean;
  onToggle: () => void;
}) {
  return (
    <IconCircleButton
      label={saved ? "Remove from saved" : "Save home"}
      onClick={onToggle}
    >
      <Heart
        size={18}
        className={saved ? "fill-forest text-forest" : "text-forest"}
      />
    </IconCircleButton>
  );
}

function ShareListingButton({ listing }: { listing: Listing }) {
  async function share() {
    const url = window.location.href;
    const title = `${listing.address}, ${listing.city}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied.");
    } catch {
      toast("Could not copy the link.");
    }
  }

  return (
    <IconCircleButton label="Share home" onClick={() => void share()}>
      <Share size={18} className="text-forest" />
    </IconCircleButton>
  );
}

function formatListingStat(value: number) {
  if (!value) return "--";
  return String(value);
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-5 text-center first:pl-1 last:pr-1">
      <dt className="sr-only">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight text-forest sm:text-3xl">
        {value}
      </dd>
      <p className="mt-0.5 text-sm text-muted">{label}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3.5 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-forest">{value}</dd>
    </div>
  );
}

function OfferGuide({
  listPrice,
  daysOnMarket,
}: {
  listPrice: number;
  daysOnMarket: number | null;
}) {
  const homeValue = useMemo(() => {
    const factor =
      daysOnMarket == null
        ? 1.0
        : daysOnMarket <= 7
          ? 1.03
          : daysOnMarket <= 30
            ? 1.0
            : 0.97;
    return Math.round(listPrice * factor);
  }, [listPrice, daysOnMarket]);

  const minOffer = Math.round(listPrice * 0.88);
  const maxOffer = Math.round(listPrice * 1.12);
  const [offer, setOffer] = useState(listPrice);

  const winChance = useMemo(() => {
    const ratio = offer / homeValue;
    let pct: number;
    if (ratio < 0.9) pct = 8 + (ratio - 0.88) * 200;
    else if (ratio < 1) pct = 28 + (ratio - 0.9) * 420;
    else if (ratio < 1.05) pct = 70 + (ratio - 1) * 400;
    else pct = 90 + (ratio - 1.05) * 70;
    return Math.min(96, Math.max(5, Math.round(pct)));
  }, [offer, homeValue]);

  const vsList = offer - listPrice;
  const vsListLabel =
    vsList === 0
      ? "At list price"
      : vsList > 0
        ? `${formatPrice(vsList)} over list`
        : `${formatPrice(Math.abs(vsList))} under list`;

  return (
    <div className="mt-3 rounded-2xl border border-line bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold tracking-tight text-forest">
        Offer guide
      </h3>
      <p className="mt-1 text-xs leading-5 text-muted">
        Estimate only — not an appraisal or acceptance guarantee.
      </p>

      <div className="mt-4">
        <p className="text-xs text-muted">Home value estimate</p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight text-forest">
          {formatPrice(homeValue)}
        </p>
        <p className="mt-1 text-xs text-muted">
          List price {formatPrice(listPrice)}
          {daysOnMarket != null ? ` · ${daysOnMarket} days on market` : ""}
        </p>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs text-muted">Your offer</p>
          <p className="text-lg font-semibold text-forest">
            {formatPrice(offer)}
          </p>
        </div>
        <RangeSlider
          min={minOffer}
          max={maxOffer}
          step={1000}
          value={offer}
          onChange={(e) => setOffer(Number(e.target.value))}
          className="mt-2 w-full"
          aria-label="Offer amount"
        />
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>{formatPrice(minOffer)}</span>
          <span>{vsListLabel}</span>
          <span>{formatPrice(maxOffer)}</span>
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-warm px-3.5 py-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Chance of winning</p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight text-forest">
              {winChance}%
            </p>
          </div>
          <p className="max-w-[9.5rem] text-right text-[11px] leading-4 text-muted">
            Based on how your offer sits vs. the value estimate.
          </p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-forest transition-[width] duration-200"
            style={{ width: `${winChance}%` }}
          />
        </div>
      </div>
    </div>
  );
}
