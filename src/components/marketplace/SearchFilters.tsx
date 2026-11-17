"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { CheckboxMark } from "@/components/ui/Checkbox";
import { DualRangeSlider } from "@/components/ui/DualRangeSlider";
import { LocationSearch } from "@/components/marketplace/LocationSearch";
import { cn, formatCompactPrice, formatNumber } from "@/lib/format";

export type PropertyStatus = "For Sale" | "Sold";
export type PropertyType = "House" | "Condo" | "Townhouse" | "Loft" | "Co-op";
export type PanelId = "status" | "price" | "beds" | "type" | "sqft";

export interface FilterState {
  location: string;
  status: PropertyStatus | "All";
  minPrice: number | null;
  maxPrice: number | null;
  beds: number | null;
  baths: number | null;
  bedsExact: boolean;
  types: PropertyType[];
  minSqft: number | null;
  maxSqft: number | null;
  priceCut: boolean;
  newListing: boolean;
  withinBuyingPower: boolean;
  /** Applied natural-language home description (AI search). */
  aiQuery: string;
  /** @deprecated use types */
  type?: PropertyType | "All";
}

export const defaultFilters: FilterState = {
  location: "New York, NY",
  status: "For Sale",
  minPrice: null,
  maxPrice: null,
  beds: null,
  baths: null,
  bedsExact: false,
  types: [],
  minSqft: null,
  maxSqft: null,
  priceCut: false,
  newListing: false,
  withinBuyingPower: false,
  aiQuery: "",
};

const VALID_TYPES: PropertyType[] = ["House", "Condo", "Townhouse", "Loft", "Co-op"];

function parseOptionalInt(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function filtersFromSearchParams(sp: { get(name: string): string | null }): FilterState {
  const location = sp.get("location")?.trim() || defaultFilters.location;
  const types = (sp.get("type") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t): t is PropertyType => VALID_TYPES.includes(t as PropertyType));
  const statusRaw = sp.get("status");
  const status: FilterState["status"] =
    statusRaw === "Sold" || statusRaw === "All" || statusRaw === "For Sale"
      ? statusRaw
      : defaultFilters.status;
  return {
    ...defaultFilters,
    location,
    types,
    status,
    minPrice: parseOptionalInt(sp.get("minPrice")),
    maxPrice: parseOptionalInt(sp.get("maxPrice")),
    beds: parseOptionalInt(sp.get("beds")),
    baths: parseOptionalInt(sp.get("baths")),
    minSqft: parseOptionalInt(sp.get("minSqft")),
    maxSqft: parseOptionalInt(sp.get("maxSqft")),
    priceCut: sp.get("priceCut") === "1",
    newListing: sp.get("newListing") === "1",
    withinBuyingPower: sp.get("withinBuyingPower") === "1",
  };
}

export function searchParamsFromFilters(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.location.trim()) params.set("location", filters.location.trim());
  if (filters.types.length) params.set("type", filters.types.join(","));
  if (filters.minPrice != null) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice != null) params.set("maxPrice", String(filters.maxPrice));
  if (filters.beds != null) params.set("beds", String(filters.beds));
  if (filters.baths != null) params.set("baths", String(filters.baths));
  if (filters.minSqft != null) params.set("minSqft", String(filters.minSqft));
  if (filters.maxSqft != null) params.set("maxSqft", String(filters.maxSqft));
  if (filters.status !== "For Sale") params.set("status", filters.status);
  if (filters.priceCut) params.set("priceCut", "1");
  if (filters.newListing) params.set("newListing", "1");
  if (filters.withinBuyingPower) params.set("withinBuyingPower", "1");
  return params;
}

const PRICE_STOPS: { value: number | null; label: string }[] = [
  { value: null, label: "No limit" },
  { value: 500_000, label: "$500k" },
  { value: 750_000, label: "$750k" },
  { value: 1_000_000, label: "$1M" },
  { value: 1_250_000, label: "$1.25M" },
  { value: 1_500_000, label: "$1.5M" },
  { value: 1_750_000, label: "$1.75M" },
  { value: 2_000_000, label: "$2M" },
  { value: 2_500_000, label: "$2.5M" },
  { value: 3_000_000, label: "$3M" },
  { value: 3_500_000, label: "$3.5M" },
  { value: 4_000_000, label: "$4M" },
  { value: 5_000_000, label: "$5M" },
  { value: 6_000_000, label: "$6M" },
  { value: 7_000_000, label: "$7M" },
  { value: 8_000_000, label: "$8M" },
  { value: 10_000_000, label: "$10M" },
  { value: 12_000_000, label: "$12M" },
  { value: 15_000_000, label: "$15M" },
  { value: 20_000_000, label: "$20M" },
];

const PRICE_SLIDER_MIN = 0;
const PRICE_SLIDER_MAX = 10_000_000;
const PRICE_SLIDER_STEP = 100_000;

const SQFT_STOPS: { value: number | null; label: string }[] = [
  { value: null, label: "No limit" },
  { value: 500, label: "500" },
  { value: 750, label: "750" },
  { value: 1_000, label: "1,000" },
  { value: 1_250, label: "1,250" },
  { value: 1_500, label: "1,500" },
  { value: 1_750, label: "1,750" },
  { value: 2_000, label: "2,000" },
  { value: 2_250, label: "2,250" },
  { value: 2_500, label: "2,500" },
  { value: 3_000, label: "3,000" },
  { value: 3_500, label: "3,500" },
  { value: 4_000, label: "4,000" },
  { value: 5_000, label: "5,000" },
  { value: 6_000, label: "6,000" },
  { value: 8_000, label: "8,000" },
];

const SQFT_PRESETS: { min: number | null; max: number | null; label: string }[] = [
  { min: null, max: null, label: "Any" },
  { min: null, max: 1_500, label: "Under 1,500" },
  { min: 1_000, max: null, label: "1,000+" },
  { min: 1_500, max: null, label: "1,500+" },
  { min: 2_000, max: null, label: "2,000+" },
  { min: 2_500, max: 4_000, label: "2,500–4,000" },
  { min: 3_000, max: null, label: "3,000+" },
  { min: 4_000, max: null, label: "4,000+" },
];

const HOME_TYPES: { id: PropertyType; blurb: string }[] = [
  { id: "Townhouse", blurb: "Multi-story attached home, often with a stoop or garden." },
  { id: "House", blurb: "Single-family, detached or semi-detached." },
  { id: "Condo", blurb: "Privately owned unit with common charges." },
];

const STATUSES: { id: PropertyStatus | "All"; title: string; blurb: string }[] = [
  { id: "For Sale", title: "For Sale", blurb: "Active listings on the market." },
  { id: "Sold", title: "Sold", blurb: "Recently closed sales." },
  { id: "All", title: "All listings", blurb: "For sale and sold." },
];

function withCurrentStop(
  stops: { value: number | null; label: string }[],
  current: number | null,
  format: (n: number) => string,
) {
  if (current == null || stops.some((s) => s.value === current)) return stops;
  const extra = { value: current, label: `${format(current)} · custom` };
  return [...stops, extra].sort((a, b) => (a.value ?? -1) - (b.value ?? -1));
}

function Dropdown({
  id,
  openId,
  setOpenId,
  label,
  children,
  disabled,
  filled,
  align = "left",
  chipClass,
  menu = "down",
  panelClass,
}: {
  id: PanelId;
  openId: PanelId | null;
  setOpenId: (id: PanelId | null) => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  filled?: boolean;
  align?: "left" | "right";
  chipClass: string;
  menu?: "down" | "up";
  panelClass?: string;
}) {
  const open = openId === id;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
        onClick={() => setOpenId(open ? null : id)}
        className={cn(
          "flex h-9 shrink-0 items-center justify-between gap-1 rounded-full border px-3 text-sm text-forest disabled:cursor-not-allowed disabled:opacity-40",
          chipClass,
          filled
            ? "border-lime bg-lime hover:brightness-95"
            : cn("border-line bg-white hover:bg-warm", open && "bg-warm"),
        )}
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown size={14} className={cn("shrink-0 transition", open && "rotate-180")} />
      </button>
      {open && !disabled ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close"
            onClick={() => setOpenId(null)}
          />
          <div
            role="dialog"
            className={cn(
              "absolute z-20 rounded-2xl border border-line bg-white p-4 shadow-xl",
              menu === "up" ? "bottom-11" : "top-11",
              align === "right" ? "right-0" : "left-0",
              "w-[min(calc(100vw-2rem),26rem)]",
              panelClass ??
                "max-h-[min(34rem,calc(100vh-7rem))] overflow-y-auto",
            )}
          >
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-xs font-medium text-muted">{children}</p>
      {hint}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  size = "sm",
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border font-medium transition",
        size === "md" ? "min-w-[2.75rem] px-3 py-2 text-sm" : "px-3 py-1.5 text-xs",
        active
          ? "border-forest bg-forest text-cream"
          : "border-line bg-white text-forest hover:bg-warm",
      )}
    >
      {children}
    </button>
  );
}

function StopList({
  value,
  options,
  onChange,
}: {
  value: number | null;
  options: { value: number | null; label: string }[];
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-line bg-cream/40 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={`${opt.label}-${opt.value ?? "any"}`}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition",
              active ? "bg-forest text-cream" : "text-forest hover:bg-warm",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PrefixedInput({
  prefix,
  suffix,
  value,
  placeholder,
  onChange,
  onCommit,
}: {
  prefix?: string;
  suffix?: string;
  value: string;
  placeholder: string;
  onChange: (raw: string) => void;
  onCommit: (raw: string) => void;
}) {
  return (
    <label className="flex h-10 items-center rounded-xl border border-line bg-cream/60 px-3 text-sm text-forest focus-within:border-forest">
      {prefix ? <span className="mr-1 text-muted">{prefix}</span> : null}
      <input
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(value);
        }}
        className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
      />
      {suffix ? <span className="ml-1 text-xs text-muted">{suffix}</span> : null}
    </label>
  );
}

function CheckRow({
  on,
  title,
  blurb,
  onClick,
}: {
  on: boolean;
  title: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
        on ? "border-forest bg-warm" : "border-line hover:bg-warm",
      )}
    >
      <CheckboxMark checked={on} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium text-forest">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{blurb}</span>
      </span>
    </button>
  );
}

function PanelFooter({
  count,
  onDone,
  onReset,
  canReset,
}: {
  count?: number;
  onDone: () => void;
  onReset?: () => void;
  canReset?: boolean;
}) {
  return (
    <div className="mt-4 flex items-center gap-2">
      {canReset && onReset ? (
        <button type="button" onClick={onReset} className="text-xs text-muted hover:text-forest">
          Reset
        </button>
      ) : (
        <span />
      )}
      <Button type="button" variant="lime" className="ml-auto h-9 px-4" onClick={onDone}>
        {count == null
          ? "Done"
          : `See ${formatNumber(count)} ${count === 1 ? "home" : "homes"}`}
      </Button>
    </div>
  );
}

function parsePositiveInt(raw: string): number | null {
  const n = Number(raw.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** Digits-only typing → display with thousands commas. */
function formatIntDraft(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return formatNumber(Number(digits));
}

function rangeLabel(
  min: number | null,
  max: number | null,
  format: (n: number) => string,
  empty: string,
) {
  if (min == null && max == null) return empty;
  if (min != null && max != null) return `${format(min)} – ${format(max)}`;
  if (min != null) return `${format(min)}+`;
  return `Up to ${format(max ?? 0)}`;
}

export function SearchFilters({
  filters,
  onChange,
  resultCount,
  onSave,
  onSearch,
  className,
  menu = "down",
  hasBuyingPower = false,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  resultCount?: number;
  onSave?: () => void;
  onSearch?: () => void;
  className?: string;
  menu?: "down" | "up";
  hasBuyingPower?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [openId, setOpenId] = useState<PanelId | null>(null);
  const [minPriceDraft, setMinPriceDraft] = useState("");
  const [maxPriceDraft, setMaxPriceDraft] = useState("");
  const [minSqftDraft, setMinSqftDraft] = useState("");
  const [maxSqftDraft, setMaxSqftDraft] = useState("");

  useEffect(() => {
    setMinPriceDraft(
      filters.minPrice != null ? formatNumber(filters.minPrice) : "",
    );
  }, [filters.minPrice]);

  useEffect(() => {
    setMaxPriceDraft(
      filters.maxPrice != null ? formatNumber(filters.maxPrice) : "",
    );
  }, [filters.maxPrice]);

  useEffect(() => {
    setMinSqftDraft(filters.minSqft != null ? String(filters.minSqft) : "");
  }, [filters.minSqft]);

  useEffect(() => {
    setMaxSqftDraft(filters.maxSqft != null ? String(filters.maxSqft) : "");
  }, [filters.maxSqft]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const types = filters.types ?? [];
  const close = () => setOpenId(null);

  const setPrice = (min: number | null, max: number | null) => {
    const nextMin = min;
    let nextMax = max;
    if (nextMin != null && nextMax != null && nextMin > nextMax) nextMax = null;
    onChange({ ...filters, minPrice: nextMin, maxPrice: nextMax });
  };

  const setSqft = (min: number | null, max: number | null) => {
    const nextMin = min;
    let nextMax = max;
    if (nextMin != null && nextMax != null && nextMin > nextMax) nextMax = null;
    onChange({ ...filters, minSqft: nextMin, maxSqft: nextMax });
  };

  const toggleType = (id: PropertyType) => {
    const next = types.includes(id) ? types.filter((t) => t !== id) : [...types, id];
    onChange({ ...filters, types: next });
  };

  const priceFilled =
    filters.minPrice != null ||
    filters.maxPrice != null ||
    filters.withinBuyingPower;
  const priceLabel = filters.withinBuyingPower
    ? filters.minPrice != null || filters.maxPrice != null
      ? `${rangeLabel(filters.minPrice, filters.maxPrice, formatCompactPrice, "Price")} · Power`
      : "Buying power"
    : priceFilled
      ? rangeLabel(filters.minPrice, filters.maxPrice, formatCompactPrice, "Price")
      : "Price";

  const bedsFilled = filters.beds != null || filters.baths != null;
  const bedWord =
    filters.beds === 0
      ? "Studio"
      : filters.beds == null
        ? "Any bd"
        : filters.bedsExact && filters.beds < 5
          ? `${filters.beds} bd`
          : `${filters.beds}+ bd`;
  const bathWord =
    filters.baths == null
      ? "Any ba"
      : filters.baths === 4
        ? "4+ ba"
        : `${filters.baths} ba`;
  const bedLabel = bedsFilled ? `${bedWord}, ${bathWord}` : "Beds & baths";

  const typesFilled = types.length > 0;
  const typeLabel = !typesFilled ? "Home type" : types.length === 1 ? types[0] : `${types.length} types`;

  const sqftFilled = filters.minSqft != null || filters.maxSqft != null;
  const sqftLabel = !sqftFilled
    ? "Sqft"
    : rangeLabel(filters.minSqft, filters.maxSqft, formatNumber, "Sqft") +
      (filters.maxSqft == null && filters.minSqft != null ? " sqft" : "");

  const statusFilled =
    filters.status !== "For Sale" || filters.priceCut || filters.newListing;

  const minPriceStops = withCurrentStop(PRICE_STOPS, filters.minPrice, formatCompactPrice).map((s) => ({
    ...s,
    label: s.value == null ? "No min" : s.label,
  }));
  const maxPriceStops = withCurrentStop(PRICE_STOPS, filters.maxPrice, formatCompactPrice).map((s) => ({
    ...s,
    label: s.value == null ? "No max" : s.label,
  }));
  const minSqftStops = withCurrentStop(SQFT_STOPS, filters.minSqft, formatNumber).map((s) => ({
    ...s,
    label: s.value == null ? "No min" : `${s.label} sqft`,
  }));
  const maxSqftStops = withCurrentStop(SQFT_STOPS, filters.maxSqft, formatNumber).map((s) => ({
    ...s,
    label: s.value == null ? "No max" : `${s.label} sqft`,
  }));

  return (
    <div className={cn("border-b border-line bg-cream px-4 py-2.5 lg:px-6", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <LocationSearch
          value={filters.location}
          onChange={(location) => onChange({ ...filters, location })}
          onOpen={() => setOpenId(null)}
          suppress={openId != null}
          commitOnly
        />

        <Dropdown
          id="status"
          openId={openId}
          setOpenId={setOpenId}
          menu={menu}
          filled={statusFilled}
          chipClass="w-[7.75rem]"
          label={
            filters.priceCut || filters.newListing
              ? `${filters.status === "All" ? "All" : filters.status} · ${
                  filters.priceCut ? "Price cut" : "New"
                }`
              : filters.status === "All"
                ? "All listings"
                : filters.status
          }
        >
          <p className="mb-1 text-sm font-medium text-forest">Listing status</p>
          <p className="mb-3 text-xs text-muted">Choose what appears on the map and in results.</p>
          <div className="space-y-1">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange({ ...filters, status: s.id })}
                className={cn(
                  "w-full rounded-xl px-3 py-2.5 text-left transition",
                  filters.status === s.id
                    ? "bg-forest text-cream hover:bg-forest"
                    : "hover:bg-warm",
                )}
              >
                <span className="block text-sm font-medium">{s.title}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-xs",
                    filters.status === s.id ? "text-cream/80" : "text-muted",
                  )}
                >
                  {s.blurb}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <FieldLabel>Highlights</FieldLabel>
            <CheckRow
              on={filters.newListing}
              title="New listing only"
              blurb="Homes recently brought to market."
              onClick={() => onChange({ ...filters, newListing: !filters.newListing })}
            />
            <CheckRow
              on={filters.priceCut}
              title="Price cut only"
              blurb="Homes that have reduced asking price."
              onClick={() => onChange({ ...filters, priceCut: !filters.priceCut })}
            />
          </div>
          <PanelFooter
            count={resultCount}
            onDone={close}
            canReset={statusFilled}
            onReset={() =>
              onChange({
                ...filters,
                status: "For Sale",
                priceCut: false,
                newListing: false,
              })
            }
          />
        </Dropdown>

        <Dropdown
          id="price"
          openId={openId}
          setOpenId={setOpenId}
          menu={menu}
          filled={priceFilled}
          chipClass="w-[7.75rem]"
          label={priceLabel}
          panelClass="max-h-[min(52rem,calc(100vh-4rem))] overflow-y-auto"
        >
          <p className="mb-1 text-sm font-medium text-forest">Price</p>
          <p className="mb-3 text-xs text-muted">
            Set a min and max or filter to homes within your buying power.
          </p>
          <FieldLabel>Range</FieldLabel>
          <DualRangeSlider
            min={PRICE_SLIDER_MIN}
            max={PRICE_SLIDER_MAX}
            step={PRICE_SLIDER_STEP}
            valueMin={filters.minPrice ?? PRICE_SLIDER_MIN}
            valueMax={
              filters.maxPrice == null
                ? PRICE_SLIDER_MAX
                : Math.min(filters.maxPrice, PRICE_SLIDER_MAX)
            }
            aria-label="Price"
            onChange={(lo, hi) => {
              setPrice(
                lo <= PRICE_SLIDER_MIN ? null : lo,
                hi >= PRICE_SLIDER_MAX ? null : hi,
              );
            }}
          />
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span>
              {filters.minPrice == null
                ? "No min"
                : formatCompactPrice(filters.minPrice)}
            </span>
            <span>
              {filters.maxPrice == null || filters.maxPrice >= PRICE_SLIDER_MAX
                ? "No max"
                : formatCompactPrice(filters.maxPrice)}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Minimum</FieldLabel>
              <PrefixedInput
                prefix="$"
                value={minPriceDraft}
                placeholder="No min"
                onChange={(raw) => setMinPriceDraft(formatIntDraft(raw))}
                onCommit={(raw) => setPrice(raw.trim() ? parsePositiveInt(raw) : null, filters.maxPrice)}
              />
              <StopList
                value={filters.minPrice}
                options={minPriceStops}
                onChange={(min) => setPrice(min, filters.maxPrice)}
              />
            </div>
            <div>
              <FieldLabel>Maximum</FieldLabel>
              <PrefixedInput
                prefix="$"
                value={maxPriceDraft}
                placeholder="No max"
                onChange={(raw) => setMaxPriceDraft(formatIntDraft(raw))}
                onCommit={(raw) => setPrice(filters.minPrice, raw.trim() ? parsePositiveInt(raw) : null)}
              />
              <StopList
                value={filters.maxPrice}
                options={maxPriceStops}
                onChange={(max) => setPrice(filters.minPrice, max)}
              />
            </div>
          </div>
          {hasBuyingPower ? (
            <div className="mt-4 space-y-2">
              <FieldLabel>Buying power</FieldLabel>
              <CheckRow
                on={filters.withinBuyingPower}
                title="Within my buying power"
                blurb="Only homes at or under your estimated capacity."
                onClick={() =>
                  onChange({
                    ...filters,
                    withinBuyingPower: !filters.withinBuyingPower,
                  })
                }
              />
            </div>
          ) : null}
          <PanelFooter
            count={resultCount}
            onDone={close}
            canReset={priceFilled}
            onReset={() =>
              onChange({
                ...filters,
                minPrice: null,
                maxPrice: null,
                withinBuyingPower: false,
              })
            }
          />
        </Dropdown>

        <Dropdown
          id="beds"
          openId={openId}
          setOpenId={setOpenId}
          menu={menu}
          filled={bedsFilled}
          align="right"
          chipClass="w-[9.5rem]"
          label={bedLabel}
        >
          <p className="mb-1 text-sm font-medium text-forest">Beds & baths</p>
          <p className="mb-3 text-xs text-muted">
            Choose beds and baths for the homes you want to see.
          </p>
          <FieldLabel>Bedrooms</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {([null, 0, 1, 2, 3, 4, 5] as const).map((n) => (
              <Chip
                key={`bd-${n}`}
                size="md"
                active={filters.beds === n}
                onClick={() => onChange({ ...filters, beds: n })}
              >
                {n == null ? "Any" : n === 0 ? "Studio" : n === 5 ? "5+" : String(n)}
              </Chip>
            ))}
          </div>
          <div className="mt-4">
            <FieldLabel>Bathrooms</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {([null, 1, 1.5, 2, 2.5, 3, 3.5, 4] as const).map((n) => (
                <Chip
                  key={`ba-${n}`}
                  size="md"
                  active={filters.baths === n}
                  onClick={() => onChange({ ...filters, baths: n })}
                >
                  {n == null ? "Any" : n === 4 ? "4+" : String(n)}
                </Chip>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <CheckRow
              on={filters.bedsExact}
              title="Exact match"
              blurb="Only homes with this exact bedroom count. Studio is always exact."
              onClick={() =>
                onChange({ ...filters, bedsExact: !filters.bedsExact })
              }
            />
          </div>
          <PanelFooter
            count={resultCount}
            onDone={close}
            canReset={bedsFilled || filters.bedsExact}
            onReset={() => onChange({ ...filters, beds: null, baths: null, bedsExact: false })}
          />
        </Dropdown>

        <Dropdown
          id="type"
          openId={openId}
          setOpenId={setOpenId}
          menu={menu}
          filled={typesFilled}
          align="right"
          chipClass="w-[8rem]"
          label={typeLabel}
        >
          <p className="text-sm font-medium text-forest">Home type</p>
          <p className="mb-3 mt-0.5 text-xs text-muted">Select every type you want included. Leave empty for all.</p>
          <div className="space-y-1">
            {HOME_TYPES.map((t) => {
              const on = types.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleType(t.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-warm",
                    on && "bg-warm",
                  )}
                >
                  <CheckboxMark checked={on} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium text-forest">{t.id}</span>
                    <span className="mt-0.5 block text-xs text-muted">{t.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <PanelFooter
            count={resultCount}
            onDone={close}
            canReset={typesFilled}
            onReset={() => onChange({ ...filters, types: [] })}
          />
        </Dropdown>

        <Dropdown
          id="sqft"
          openId={openId}
          setOpenId={setOpenId}
          menu={menu}
          filled={sqftFilled}
          align="right"
          chipClass="w-[7.75rem]"
          label={sqftLabel}
        >
          <div className="mb-3">
            <p className="text-sm font-medium text-forest">Living area</p>
            <p className="mt-0.5 text-xs text-muted">
              Interior square footage
              {sqftFilled
                ? ` · ${rangeLabel(filters.minSqft, filters.maxSqft, (n) => `${formatNumber(n)} sqft`, "")}`
                : ""}
            </p>
          </div>
          <FieldLabel>Quick ranges</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {SQFT_PRESETS.map((p) => (
              <Chip
                key={p.label}
                active={filters.minSqft === p.min && filters.maxSqft === p.max}
                onClick={() => setSqft(p.min, p.max)}
              >
                {p.label}
              </Chip>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Minimum</FieldLabel>
              <PrefixedInput
                suffix="sqft"
                value={minSqftDraft}
                placeholder="No min"
                onChange={setMinSqftDraft}
                onCommit={(raw) => setSqft(raw.trim() ? parsePositiveInt(raw) : null, filters.maxSqft)}
              />
              <StopList
                value={filters.minSqft}
                options={minSqftStops}
                onChange={(min) => setSqft(min, filters.maxSqft)}
              />
            </div>
            <div>
              <FieldLabel>Maximum</FieldLabel>
              <PrefixedInput
                suffix="sqft"
                value={maxSqftDraft}
                placeholder="No max"
                onChange={setMaxSqftDraft}
                onCommit={(raw) => setSqft(filters.minSqft, raw.trim() ? parsePositiveInt(raw) : null)}
              />
              <StopList
                value={filters.maxSqft}
                options={maxSqftStops}
                onChange={(max) => setSqft(filters.minSqft, max)}
              />
            </div>
          </div>
          <PanelFooter
            count={resultCount}
            onDone={close}
            canReset={sqftFilled}
            onReset={() => setSqft(null, null)}
          />
        </Dropdown>

        {onSearch ? (
          <Button
            type="button"
            variant="lime"
            onClick={onSearch}
            className="h-9 w-[8.25rem] shrink-0"
          >
            Search
          </Button>
        ) : (
          <Button
            variant={saved ? "lime" : "outline"}
            onClick={() => {
              setSaved(true);
              onSave?.();
            }}
            className="h-9 w-[8.25rem] shrink-0"
          >
            {saved ? "Search saved" : "Save search"}
          </Button>
        )}
      </div>
    </div>
  );
}
