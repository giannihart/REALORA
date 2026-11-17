"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LocationSearch } from "@/components/marketplace/LocationSearch";
import { cn } from "@/lib/format";

const BED_OPTIONS = [
  { value: "5", label: "+5 beds" },
  { value: "4", label: "4 beds" },
  { value: "3", label: "3 beds" },
  { value: "2", label: "2 beds" },
  { value: "1", label: "1 bed" },
  { value: "0", label: "Studio" },
  { value: "", label: "Any" },
] as const;

const BATH_OPTIONS = [
  { value: "4", label: "+4 baths" },
  { value: "3.5", label: "3.5 baths" },
  { value: "3", label: "3 baths" },
  { value: "2.5", label: "2.5 baths" },
  { value: "2", label: "2 baths" },
  { value: "1.5", label: "1.5 baths" },
  { value: "1", label: "1 bath" },
  { value: "", label: "Any" },
] as const;

type Option = { value: string; label: string };

function SegmentDivider() {
  return (
    <div
      aria-hidden
      className="mx-1 hidden h-8 w-px shrink-0 self-center bg-line sm:block"
    />
  );
}

const segmentClass =
  "group flex h-12 items-center rounded-full px-4 transition hover:bg-warm/70 focus-within:bg-warm/70 sm:px-5";

function SegmentMenu({
  label,
  placeholder,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: readonly Option[];
  onChange: (next: string) => void;
  className?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.find((o) => o.value === value);
  const display = value ? (selected?.label ?? value) : placeholder;

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn(segmentClass, "relative cursor-pointer", className)}>
      <span className="sr-only">{label}</span>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          "h-5 w-full text-left text-sm font-medium leading-5 outline-none",
          value ? "text-forest" : "text-muted",
        )}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (!open) {
            if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(options.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const opt = options[active];
            if (opt) pick(opt.value);
          }
        }}
      >
        {display}
      </button>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-10 cursor-default"
          aria-label="Close"
          onClick={() => setOpen(false)}
        />
      ) : null}
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-2xl border border-line bg-white p-4 shadow-xl"
        >
          <div className="space-y-1">
            {options.map((opt, index) => {
              const current = opt.value === value;
              const focused = index === active;
              return (
                <button
                  key={opt.value || "any"}
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={current}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt.value)}
                  className={cn(
                    "w-full rounded-xl px-3 py-2.5 text-left transition",
                    current
                      ? "bg-forest text-cream hover:bg-forest"
                      : cn("hover:bg-warm", focused && "bg-warm"),
                  )}
                >
                  <span className="block text-sm font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HomeSearchBar() {
  const router = useRouter();
  const [location, setLocation] = useState("");
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [locationRoot, setLocationRoot] = useState<HTMLLabelElement | null>(null);

  function search() {
    const params = new URLSearchParams();
    if (location.trim()) params.set("location", location.trim());
    if (beds) params.set("beds", beds);
    if (baths) params.set("baths", baths);
    const q = params.toString();
    router.push(q ? `/buy?${q}` : "/buy");
  }

  return (
    <div className="relative z-30 w-full max-w-3xl">
      <form
        className="flex w-full items-center rounded-full border border-line/70 bg-white p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <label
          ref={setLocationRoot}
          className={cn(segmentClass, "relative min-w-0 flex-[1.55] cursor-text")}
        >
          <span className="sr-only">Where</span>
          <LocationSearch
            variant="bare"
            placement="top"
            listRoot={locationRoot}
            value={location}
            onChange={setLocation}
            className="flex h-5 w-full items-center [&_input]:!h-5 [&_input]:!py-0 [&_input]:text-left [&_input]:!font-medium [&_input]:!leading-5 [&_input]:placeholder:text-left [&_input]:placeholder:!font-medium"
            placeholder="Enter a city, neighborhood, or address"
          />
        </label>

        <SegmentDivider />

        <SegmentMenu
          label="Beds"
          placeholder="Add beds"
          value={beds}
          options={BED_OPTIONS}
          onChange={setBeds}
          className="min-w-[4.75rem] flex-[0.6] sm:min-w-[5.5rem]"
        />

        <SegmentDivider />

        <SegmentMenu
          label="Baths"
          placeholder="Add baths"
          value={baths}
          options={BATH_OPTIONS}
          onChange={setBaths}
          className="min-w-[4.75rem] flex-[0.6] sm:min-w-[5.5rem]"
        />

        <Button
          type="submit"
          variant="lime"
          className="ml-1 h-12 shrink-0 gap-2 px-5"
        >
          <Search size={16} strokeWidth={2.25} />
          Search
        </Button>
      </form>
    </div>
  );
}
