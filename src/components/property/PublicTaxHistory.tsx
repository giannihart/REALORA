"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/types";

const VISIBLE_ROWS = 5;

type TaxRow = {
  year: number;
  taxes: number | null;
  taxChange: number | null;
  assessment: number;
  assessmentChange: number | null;
};

function hash(id: string, salt: string) {
  let n = 2166136261;
  for (const c of `${id}:${salt}`) {
    n ^= c.charCodeAt(0);
    n = Math.imul(n, 16777619);
  }
  return Math.abs(n);
}

function deltaPct(id: string, salt: string) {
  const n = hash(id, salt) % 1000;
  if (n < 18) return (n % 2 === 0 ? 1 : -1) * (25 + (n % 40));
  return (n % 360 - 140) / 10;
}

function taxHistory(listing: Listing): TaxRow[] {
  const latest = listing.taxes > 0 ? listing.taxes : Math.round(listing.price * 0.0045);
  let taxes = latest;
  let assessment = Math.max(80_000, Math.round(latest / 0.112));
  const rows: TaxRow[] = [];

  for (let i = 0; i < 13; i++) {
    const year = 2026 - i;
    const taxDelta = deltaPct(listing.id, `tax:${year}`);
    const assDelta = deltaPct(listing.id, `av:${year}`);
    const missingTax = year <= 2022 && hash(listing.id, `miss:${year}`) % 5 === 0;

    rows.push({
      year,
      taxes: missingTax ? null : Math.round(taxes),
      taxChange: missingTax ? null : taxDelta,
      assessment: Math.round(assessment),
      assessmentChange: assDelta,
    });

    if (!missingTax) {
      taxes = Math.round(taxes / Math.max(0.55, 1 + taxDelta / 100));
    }
    assessment = Math.round(assessment / Math.max(0.55, 1 + assDelta / 100));
  }

  return rows;
}

function Change({ value }: { value: number | null }) {
  if (value == null) return null;
  const rounded = Math.round(value * 10) / 10;
  const label = `${rounded > 0 ? "+" : ""}${rounded}%`;
  return (
    <span
      className={
        rounded < 0
          ? "ml-1.5 tabular-nums text-[#dc2626]"
          : "ml-1.5 tabular-nums text-[#15803d]"
      }
    >
      {label}
    </span>
  );
}

export function PublicTaxHistory({ listing }: { listing: Listing }) {
  const rows = useMemo(() => taxHistory(listing), [listing]);
  const [expanded, setExpanded] = useState(false);
  const scrollLock = useRef<number | null>(null);
  const canToggle = rows.length > VISIBLE_ROWS;
  const visible = expanded || !canToggle ? rows : rows.slice(0, VISIBLE_ROWS);

  useLayoutEffect(() => {
    if (scrollLock.current == null) return;
    window.scrollTo({ top: scrollLock.current, behavior: "instant" });
    scrollLock.current = null;
  }, [expanded]);

  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight text-forest">
        Public tax history
      </h2>
      <p className="mt-1 text-sm text-muted">
        Figures from this listing file. Confirm with the NYC Department of
        Finance.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="py-2.5 pr-4 font-semibold text-forest">Year</th>
              <th className="py-2.5 pr-4 font-semibold text-forest">
                Property taxes
              </th>
              <th className="py-2.5 font-semibold text-forest">Tax assessment</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.year} className="border-b border-line">
                <td className="py-3 pr-4 tabular-nums text-forest">{row.year}</td>
                <td className="py-3 pr-4">
                  {row.taxes == null ? (
                    <span className="text-muted">--</span>
                  ) : (
                    <>
                      <span className="tabular-nums text-forest">
                        {formatPrice(row.taxes)}
                      </span>
                      <Change value={row.taxChange} />
                    </>
                  )}
                </td>
                <td className="py-3">
                  <span className="tabular-nums text-forest">
                    {formatPrice(row.assessment)}
                  </span>
                  <Change value={row.assessmentChange} />
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
