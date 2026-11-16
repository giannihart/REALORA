"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Globe } from "lucide-react";
import { cn } from "@/lib/format";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const SLOTS = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
];

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isUnavailable(date: Date, today: Date) {
  if (startOfDay(date) < today) return true;
  return date.getDay() === 0;
}

function formatSlot(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const hour = h ?? 0;
  const am = hour < 12;
  const h12 = hour % 12 || 12;
  return `${h12}:${String(m ?? 0).padStart(2, "0")}${am ? "am" : "pm"}`;
}

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const pad = first.getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: pad }, () => null),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function ScheduleCalendar({
  date,
  time,
  onDateChange,
  onTimeChange,
}: {
  date: string;
  time: string | null;
  onDateChange: (iso: string) => void;
  onTimeChange: (slot: string | null) => void;
}) {
  const selected = parseISODate(date);
  const [view, setView] = useState({
    year: selected.getFullYear(),
    month: selected.getMonth(),
  });
  const today = useMemo(() => startOfDay(new Date()), []);
  const cells = useMemo(
    () => monthCells(view.year, view.month),
    [view.year, view.month],
  );
  const monthLabel = new Date(view.year, view.month, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const selectedLabel = selected.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const minMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const maxMonth = new Date(today.getFullYear(), today.getMonth() + 3, 1);
  const viewMonth = new Date(view.year, view.month, 1);
  const canPrev = viewMonth > minMonth;
  const canNext = new Date(view.year, view.month + 1, 1) < maxMonth;

  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="grid sm:grid-cols-[1fr_11.5rem]">
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-forest">{monthLabel}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous month"
                disabled={!canPrev}
                onClick={() =>
                  setView((v) => {
                    const d = new Date(v.year, v.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
                className="flex h-8 w-8 items-center justify-center rounded-full text-forest hover:bg-warm disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label="Next month"
                disabled={!canNext}
                onClick={() =>
                  setView((v) => {
                    const d = new Date(v.year, v.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
                className="flex h-8 w-8 items-center justify-center rounded-full text-forest hover:bg-warm disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-medium tracking-wide text-muted">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 text-center text-sm">
            {cells.map((day, i) => {
              if (day == null) return <div key={`e-${i}`} className="h-9" />;
              const cellDate = new Date(view.year, view.month, day);
              const iso = toISODate(cellDate);
              const unavailable = isUnavailable(cellDate, today);
              const isSelected = iso === date;
              const isToday = iso === toISODate(today);
              return (
                <div key={iso} className="flex h-9 items-center justify-center">
                  <button
                    type="button"
                    disabled={unavailable}
                    aria-pressed={isSelected}
                    aria-label={cellDate.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                    onClick={() => {
                      if (iso !== date) onTimeChange(null);
                      onDateChange(iso);
                    }}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm transition",
                      unavailable && "cursor-not-allowed text-muted/40",
                      !unavailable && !isSelected && "text-forest hover:bg-warm",
                      isToday && !isSelected && "font-semibold",
                      isSelected && "bg-forest font-semibold text-cream hover:bg-forest",
                    )}
                  >
                    {day}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Globe size={14} />
            Eastern Time — New York
          </p>
        </div>
        <div className="border-t border-line p-3 sm:border-l sm:border-t-0">
          <p className="px-1 pb-2 text-sm font-medium text-forest">{selectedLabel}</p>
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
            {SLOTS.map((slot) => {
              const on = time === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onTimeChange(slot)}
                  className={cn(
                    "h-10 shrink-0 rounded-md border text-sm font-medium transition",
                    on
                      ? "border-forest bg-forest text-cream"
                      : "border-line bg-white text-forest hover:border-forest",
                  )}
                >
                  {formatSlot(slot)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
