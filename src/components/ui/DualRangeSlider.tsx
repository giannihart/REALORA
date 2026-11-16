"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/format";

type Props = {
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  onChange: (min: number, max: number) => void;
  className?: string;
  "aria-label"?: string;
};

/** Dual-thumb range using stacked native inputs + brand thumbs. */
export function DualRangeSlider({
  min,
  max,
  step = 1,
  valueMin,
  valueMax,
  onChange,
  className,
  "aria-label": ariaLabel = "Range",
}: Props) {
  const lo = Math.min(valueMin, valueMax);
  const hi = Math.max(valueMin, valueMax);
  const span = max - min;
  const loPct = span <= 0 ? 0 : ((lo - min) / span) * 100;
  const hiPct = span <= 0 ? 100 : ((hi - min) / span) * 100;

  return (
    <div className={cn("relative h-5 w-full", className)}>
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-line"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-forest"
        style={{ left: `${loPct}%`, width: `${Math.max(0, hiPct - loPct)}%` }}
        aria-hidden
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={lo}
        aria-label={`${ariaLabel} minimum`}
        onChange={(e) => {
          const next = Number(e.target.value);
          onChange(Math.min(next, hi), hi);
        }}
        className="realora-range realora-range-dual absolute inset-0 w-full"
        style={
          {
            zIndex: lo > max - step * 4 ? 5 : 3,
            "--range-progress": "0%",
          } as CSSProperties
        }
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={hi}
        aria-label={`${ariaLabel} maximum`}
        onChange={(e) => {
          const next = Number(e.target.value);
          onChange(lo, Math.max(next, lo));
        }}
        className="realora-range realora-range-dual absolute inset-0 w-full"
        style={
          {
            zIndex: 4,
            "--range-progress": "0%",
          } as CSSProperties
        }
      />
    </div>
  );
}
