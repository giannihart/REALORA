"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatNumber, formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/types";

const VISIBLE_ROWS = 5;

type PriceEvent = {
  date: Date;
  label: string;
  price: number;
  change: number | null;
  source: string;
};

function hash(id: string, salt: string) {
  let n = 2166136261;
  for (const c of `${id}:${salt}`) {
    n ^= c.charCodeAt(0);
    n = Math.imul(n, 16777619);
  }
  return Math.abs(n);
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function formatMdY(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function eventHistory(listing: Listing): PriceEvent[] {
  const today = new Date("2026-10-30T12:00:00");
  const listedAgo = 24 + (hash(listing.id, "listed-ago") % 70);
  const listedOn = addDays(today, -listedAgo);
  const events: PriceEvent[] = [];
  let price = listing.price;
  const streetEasy = `StreetEasy #S${hash(listing.id, "se") % 90_000_000 + 10_000_000}`;
  const rls = "RLS listing history";

  if (listing.status === "closed") {
    events.push({
      date: addDays(today, -(hash(listing.id, "sold-ago") % 14 + 2)),
      label: "Sold",
      price,
      change: null,
      source: "REALORA",
    });
  }

  if (listing.badge === "Price Cut" || hash(listing.id, "cut") % 3 === 0) {
    const cutDays = Math.min(listedAgo - 4, 8 + (hash(listing.id, "cut-day") % 18));
    events.push({
      date: addDays(listedOn, Math.max(5, cutDays)),
      label: "Price change",
      price,
      change: null,
      source: rls,
    });
    const cut = 1.5 + (hash(listing.id, "cut-pct") % 40) / 10;
    price = Math.round(price / (1 - cut / 100));
  }

  events.push({
    date: listedOn,
    label: "Listed for sale",
    price,
    change: null,
    source: rls,
  });

  const removedOn = addDays(listedOn, -(hash(listing.id, "removed") % 20 + 4));
  const priorList = addDays(removedOn, -(hash(listing.id, "prior") % 18 + 3));
  events.push({
    date: removedOn,
    label: "Listing removed",
    price,
    change: null,
    source: streetEasy,
  });
  events.push({
    date: priorList,
    label: "Listed for sale",
    price,
    change: null,
    source: streetEasy,
  });

  const olderPct = 12 + (hash(listing.id, "older") % 160) / 10;
  const olderPrice = Math.round(price / (1 - Math.min(olderPct, 35) / 100));
  const olderOn = addDays(priorList, -(300 + (hash(listing.id, "older-days") % 200)));
  events.push({
    date: olderOn,
    label: "Listed for sale",
    price: olderPrice,
    change: null,
    source: streetEasy,
  });

  const olderRemoved = addDays(olderOn, -(hash(listing.id, "older-rm") % 25 + 8));
  events.push({
    date: olderRemoved,
    label: "Listing removed",
    price: olderPrice,
    change: null,
    source: streetEasy,
  });

  const firstList = addDays(olderRemoved, -(hash(listing.id, "first") % 40 + 10));
  const firstPrice = Math.round(
    olderPrice / (1 - Math.min(4 + (hash(listing.id, "first-pct") % 80) / 10, 28) / 100),
  );
  events.push({
    date: firstList,
    label: "Listed for sale",
    price: firstPrice,
    change: null,
    source: streetEasy,
  });

  events.push({
    date: addDays(firstList, -(hash(listing.id, "sold-hist") % 120 + 20)),
    label: "Sold",
    price: Math.round(firstPrice * (0.88 + (hash(listing.id, "sold-p") % 20) / 100)),
    change: null,
    source: "ACRIS public records",
  });

  const ordered = events.sort((a, b) => b.date.getTime() - a.date.getTime());
  return ordered.map((row, i) => {
    const older = ordered[i + 1];
    if (!older || older.price === row.price) return row;
    return {
      ...row,
      change: ((row.price - older.price) / older.price) * 100,
    };
  });
}

function Change({ value }: { value: number | null }) {
  if (value == null) return null;
  const rounded = Math.round(value * 10) / 10;
  return (
    <span
      className={
        rounded < 0
          ? "ml-1.5 tabular-nums text-[#dc2626]"
          : "ml-1.5 tabular-nums text-[#15803d]"
      }
    >
      {`${rounded > 0 ? "+" : ""}${rounded}%`}
    </span>
  );
}

export function PriceHistory({ listing }: { listing: Listing }) {
  const events = useMemo(() => eventHistory(listing), [listing]);
  const [expanded, setExpanded] = useState(false);
  const scrollLock = useRef<number | null>(null);
  const sqft = Math.max(listing.sqft, 1);
  const canToggle = events.length > VISIBLE_ROWS;
  const visible = expanded || !canToggle ? events : events.slice(0, VISIBLE_ROWS);

  useLayoutEffect(() => {
    if (scrollLock.current == null) return;
    window.scrollTo({ top: scrollLock.current, behavior: "instant" });
    scrollLock.current = null;
  }, [expanded]);

  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight text-forest">
        Price history
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[7.5rem]" />
            <col className="w-[11.5rem]" />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b border-line">
              <th className="py-2.5 pr-4 font-semibold text-forest">Date</th>
              <th className="py-2.5 pr-4 font-semibold text-forest">Event</th>
              <th className="py-2.5 font-semibold text-forest">Price</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={`${row.label}-${row.date.toISOString()}`} className="border-b border-line align-top">
                <td className="py-3 pr-4 whitespace-nowrap tabular-nums text-forest">
                  {formatMdY(row.date)}
                </td>
                <td className="py-3 pr-4 font-medium text-forest">{row.label}</td>
                <td className="py-3">
                  <p>
                    <span className="tabular-nums text-forest">
                      {formatPrice(row.price)}
                    </span>
                    <Change value={row.change} />
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    ${formatNumber(Math.round(row.price / sqft))}/sqft
                  </p>
                  <p className="mt-1.5 text-[11px] leading-4 text-muted">
                    Source: {row.source}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canToggle ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            scrollLock.current = window.scrollY;
            setExpanded((open) => !open);
          }}
          className="mt-3 text-sm font-medium text-forest underline decoration-forest/30 underline-offset-4 hover:decoration-forest [overflow-anchor:none]"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </section>
  );
}
