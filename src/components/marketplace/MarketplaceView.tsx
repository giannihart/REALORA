"use client";

import { ChevronDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { rankByDescription } from "@/lib/ai-home-search";
import { useAppData } from "@/lib/data/use-app-data";
import { isSupabaseDataMode } from "@/lib/data/mode";
import { queryLiveListingsAction } from "@/lib/actions/listing";
import { isCitywideLocation, pointInGeometry, type PlaceBoundary } from "@/lib/geo/polygon";
import { listingCoordinate } from "@/lib/nyc/map-bounds";
import { listingMonthlyPayment } from "@/lib/buying-power";
import {
  resolveBuyingCapacity,
  withinBuyingCapacity,
} from "@/lib/buying-capacity";
import { cn } from "@/lib/format";
import type { HomeType, Listing } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import {
  SearchFilters,
  filtersFromSearchParams,
  type FilterState,
} from "./SearchFilters";
import { MapPanel } from "./MapPanel";
import { listingStatus, PropertyCard } from "./PropertyCard";
import { SiteFooter } from "@/components/public/SiteFooter";

const PAGE_SIZE = 4;

function pageItems(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 4) return Array.from({ length: total }, (_, i) => i + 1);
  const start = Math.min(Math.max(1, current - 1), Math.max(1, total - 2));
  const window = [start, start + 1, start + 2].filter((n) => n >= 1 && n <= total);
  const first = window[0] ?? 1;
  const last = window[window.length - 1] ?? total;
  const items: Array<number | "ellipsis"> = [];
  if (first > 1) {
    items.push(1);
    if (first > 2) items.push("ellipsis");
  }
  items.push(...window);
  if (last < total) {
    if (last < total - 1) items.push("ellipsis");
    items.push(total);
  }
  return items;
}

const SORTS = [
  { id: "price-desc", label: "Price (High to Low)" },
  { id: "price-asc", label: "Price (Low to High)" },
  { id: "newest", label: "Newest" },
  { id: "price-cut", label: "Price Cut" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

function listedTime(listing: Listing) {
  const raw = listing.createdAt ?? listing.syndication[0]?.at;
  if (!raw || raw === "—") return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortListings(listings: Listing[], sort: SortId) {
  const rows = [...listings];
  if (sort === "price-asc") return rows.sort((a, b) => a.price - b.price);
  if (sort === "newest") return rows.sort((a, b) => listedTime(b) - listedTime(a));
  if (sort === "price-cut") {
    return rows.sort((a, b) => {
      const ac = a.badge === "Price Cut" ? 1 : 0;
      const bc = b.badge === "Price Cut" ? 1 : 0;
      if (bc !== ac) return bc - ac;
      return b.price - a.price;
    });
  }
  return rows.sort((a, b) => b.price - a.price);
}

function SortFilter({
  value,
  onChange,
}: {
  value: SortId;
  onChange: (id: SortId) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = SORTS.find((s) => s.id === value) ?? SORTS[0];
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Sort listings"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-sm font-medium text-forest hover:underline"
      >
        {current.label}
        <ChevronDown size={14} className={cn("shrink-0 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close sort"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="absolute right-0 top-11 z-20 w-56 overflow-y-auto rounded-2xl border border-line bg-white p-4 shadow-xl"
          >
            <p className="text-sm font-medium text-forest">Sort</p>
            <p className="mb-3 mt-0.5 text-xs text-muted">Choose how listings are ordered.</p>
            <div className="space-y-1">
              {SORTS.map((s) => {
                const selected = s.id === value;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(s.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full rounded-xl px-2.5 py-2 text-left text-sm font-medium",
                      selected
                        ? "bg-forest text-cream hover:bg-forest"
                        : "text-forest hover:bg-warm",
                    )}
                  >
                    {s.label}
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

function matchesLocation(
  query: string,
  city: string,
  neighborhood: string,
  address: string,
  borough?: string,
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (/^(new york|new york, ny|ny|nyc)$/i.test(query.trim())) return true;
  const hay = `${city} ${neighborhood} ${address} ${borough ?? ""}`.toLowerCase();
  if (hay.includes(q)) return true;
  const primary = q.split(",")[0]?.trim();
  return Boolean(primary) && hay.includes(primary);
}

function statusToDb(status: FilterState["status"]): "live" | "under_contract" | "closed" | "all" {
  if (status === "Sold") return "closed";
  if (status === "All") return "all";
  return "live";
}

function matchesBeds(beds: number, min: number | null, exact: boolean) {
  if (min == null) return true;
  if (min === 0) return beds === 0;
  if (min >= 5) return beds >= 5;
  if (exact) return beds === min;
  return beds >= min;
}

export function MarketplaceView() {
  const listings = useAppData((s) => s.listings);
  const savedIds = useAppData((s) => s.savedListingIds);
  const toggleSaved = useAppData((s) => s.toggleSaved);
  const saveSearch = useAppData((s) => s.saveSearch);
  const buyingPower = useAppData((s) => s.buyingPower);
  const user = useAppData((s) => s.user);
  const capacity = useMemo(
    () => resolveBuyingCapacity({ user, buyingPower }),
    [user, buyingPower],
  );
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(() =>
    filtersFromSearchParams(searchParams),
  );
  const [sort, setSort] = useState<SortId>("price-desc");
  const [page, setPage] = useState(1);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [serverRows, setServerRows] = useState<Listing[] | null>(null);
  const [boundary, setBoundary] = useState<PlaceBoundary | null>(null);
  const [boundaryEnabled, setBoundaryEnabled] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const supabase = isSupabaseDataMode();
  const aiActive = filters.aiQuery.trim().length > 0;
  const constrainToArea = boundaryEnabled && !isCitywideLocation(filters.location);

  useEffect(() => {
    const query = filters.location.trim();
    if (isCitywideLocation(query)) {
      setBoundary(null);
      setBoundaryEnabled(true);
      return;
    }
    let cancelled = false;
    setBoundaryEnabled(true);
    void fetch(`/api/places/boundary?q=${encodeURIComponent(query)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((hit: PlaceBoundary | null) => {
        if (cancelled) return;
        setBoundary(hit?.geometry ? hit : null);
      })
      .catch(() => {
        if (!cancelled) setBoundary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.location]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void queryLiveListingsAction({
      location: constrainToArea ? filters.location : "",
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      beds: filters.beds && filters.beds > 0 ? filters.beds : null,
      bedsExact: filters.bedsExact,
      baths: filters.baths,
      types: filters.types,
      minSqft: filters.minSqft,
      maxSqft: filters.maxSqft,
      status: aiActive ? "live" : statusToDb(filters.status),
    }).then((result) => {
      if (cancelled || !result.ok) return;
      setServerRows(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    aiActive,
    filters.location,
    filters.minPrice,
    filters.maxPrice,
    filters.beds,
    filters.bedsExact,
    filters.baths,
    filters.types,
    filters.minSqft,
    filters.maxSqft,
    filters.status,
    constrainToArea,
  ]);

  const catalog = useMemo(() => {
    if (supabase && serverRows) return serverRows.filter((l) => l.marketplace && l.status !== "draft");
    return listings.filter((l) => l.marketplace && l.status !== "draft");
  }, [listings, supabase, serverRows]);

  const filtered = useMemo(() => {
    if (aiActive) {
      return rankByDescription(catalog, filters.aiQuery);
    }
    return catalog.filter((p) => {
      if (constrainToArea && boundary) {
        const coord = listingCoordinate(p);
        if (!pointInGeometry(coord.lat, coord.lng, boundary.geometry)) return false;
      } else if (constrainToArea) {
        if (!matchesLocation(filters.location, p.city, p.neighborhood, p.address, p.borough)) {
          return false;
        }
      }
      if (!supabase) {
        if (filters.status !== "All" && listingStatus(p) !== filters.status) return false;
      }
      if (filters.types.length && !filters.types.includes(p.type as (typeof filters.types)[number])) {
        return false;
      }
      if (filters.minPrice != null && p.price < filters.minPrice) return false;
      if (filters.maxPrice != null && p.price > filters.maxPrice) return false;
      if (!matchesBeds(p.beds, filters.beds, filters.bedsExact)) return false;
      if (filters.baths != null && p.baths < filters.baths) return false;
      if (filters.minSqft != null && p.sqft < filters.minSqft) return false;
      if (filters.maxSqft != null && p.sqft > filters.maxSqft) return false;
      if (filters.priceCut && p.badge !== "Price Cut") return false;
      if (filters.newListing && p.badge !== "New Listing") return false;
      if (
        filters.withinBuyingPower &&
        capacity &&
        !withinBuyingCapacity(p.price, capacity)
      ) {
        return false;
      }
      return true;
    });
  }, [catalog, filters, aiActive, supabase, serverRows, boundary, constrainToArea, capacity]);

  const sorted = useMemo(() => sortListings(filtered, sort), [filtered, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filters, sort, boundaryEnabled]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [currentPage]);

  return (
    <div id="main" className="flex h-[calc(100vh-56px)] flex-col">
      <SearchFilters
        filters={filters}
        onChange={setFilters}
        resultCount={filtered.length}
        hasBuyingPower={Boolean(capacity)}
        onSave={() => {
          saveSearch({
            location: filters.location,
            forSale: filters.status !== "Sold",
            minPrice: filters.minPrice ?? undefined,
            maxPrice: filters.maxPrice ?? undefined,
            minBeds: filters.beds ?? undefined,
            minBaths: filters.baths ?? undefined,
            homeType:
              filters.types.length === 1 && filters.types[0] !== "Co-op"
                ? (filters.types[0] as HomeType)
                : "Any",
          });
          toast("Your search has been saved");
        }}
      />
      <div className="grid min-h-0 flex-1 lg:grid-cols-[48%_52%]">
        <div className="hidden min-h-0 lg:block">
          <MapPanel
            listings={sorted}
            highlightedId={highlightedId}
            onHighlight={setHighlightedId}
            boundary={boundaryEnabled ? boundary : null}
            onRemoveBoundary={
              boundaryEnabled && boundary
                ? () => {
                    setBoundary(null);
                    setBoundaryEnabled(true);
                    setFilters((prev) => ({ ...prev, location: "" }));
                  }
                : undefined
            }
          />
        </div>
        <div ref={listRef} className="min-h-0 overflow-y-auto bg-cream px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <h1 className="min-w-0 truncate text-sm font-medium text-forest">
              {aiActive
                ? `${filtered.length} ${filtered.length === 1 ? "home" : "homes"} matched to your description`
                : `${filtered.length} ${filtered.length === 1 ? "home" : "homes"} ${
                    !boundaryEnabled && !isCitywideLocation(filters.location) ? "near" : "in"
                  } ${filters.location || "selected area"}`}
            </h1>
            <SortFilter value={sort} onChange={setSort} />
          </div>
          {filtered.length === 0 ? (
            <p className="rounded-2xl bg-white p-8 text-sm text-muted">
              {aiActive
                ? "No homes matched that description. Try mentioning a neighborhood, home type, or features like loft, fireplace, or garden."
                : "No homes match those filters. Try New York, NY."}
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {pageRows.map((p) => (
                  <PropertyCard
                    key={p.id}
                    listing={p}
                    selected={highlightedId === p.id}
                    saved={savedIds.includes(p.id)}
                    onSave={toggleSaved}
                    onHighlight={setHighlightedId}
                    monthlyEstimate={listingMonthlyPayment(p.price, buyingPower, p.taxes)}
                    withinBuyingPower={withinBuyingCapacity(p.price, capacity)}
                  />
                ))}
              </div>
              {pageCount > 1 ? (
                <div className="mt-4 flex items-center justify-center gap-2 px-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-4"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  {pageItems(currentPage, pageCount).map((item, i) =>
                    item === "ellipsis" ? (
                      <span
                        key={`ellipsis-${i}`}
                        className="flex h-9 w-9 items-center justify-center text-sm font-medium text-forest"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        aria-label={`Page ${item}`}
                        aria-current={item === currentPage ? "page" : undefined}
                        onClick={() => setPage(item)}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium",
                          item === currentPage
                            ? "bg-forest text-cream hover:bg-forest"
                            : "text-forest hover:bg-warm",
                        )}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <Button
                    type="button"
                    variant="lime"
                    className="h-9 px-4"
                    disabled={currentPage >= pageCount}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}
          <SiteFooter inColumn />
        </div>
      </div>
    </div>
  );
}
