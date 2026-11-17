"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";
import type { PlaceSuggestion } from "@/lib/google-maps/places";

export function LocationSearch({
  value,
  onChange,
  onOpen,
  suppress,
  variant = "filter",
  placement = "bottom",
  listRoot,
  className,
  placeholder = "City, neighborhood, or address",
  commitOnly = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onOpen?: () => void;
  suppress?: boolean;
  variant?: "filter" | "bare";
  placement?: "top" | "bottom";
  listRoot?: HTMLElement | null;
  className?: string;
  placeholder?: string;
  commitOnly?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [draft, setDraft] = useState(value);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const query = commitOnly ? draft : value;

  useEffect(() => {
    if (suppress) setOpen(false);
  }, [suppress]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void fetch(`/api/places/autocomplete?text=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((hits: PlaceSuggestion[]) => setSuggestions(Array.isArray(hits) ? hits : []))
        .catch(() => setSuggestions([]));
    }, 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [suggestions]);

  function commit(next: string) {
    setDraft(next);
    onChange(next);
    setOpen(false);
  }

  function pick(place: PlaceSuggestion) {
    commit(place.label);
  }

  function clear() {
    commit("");
    setSuggestions([]);
    inputRef.current?.focus();
  }

  const listOpen = open && suggestions.length > 0;
  const hasText = query.length > 0;
  const bare = variant === "bare";
  const listbox = (
    <div
      id={listId}
      role="listbox"
      className={cn(
        "absolute z-20 rounded-2xl border border-line bg-white p-4 shadow-xl",
        placement === "top" ? "bottom-full left-0 mb-2" : "left-0 top-full mt-2",
        listRoot || bare ? "w-full" : "w-[min(calc(100vw-2rem),26rem)]",
      )}
    >
      <div className="space-y-1">
        {suggestions.map((place, index) => {
          const current = place.label === value;
          const focused = index === active;
          return (
            <button
              key={place.id}
              type="button"
              id={`${listId}-${index}`}
              role="option"
              aria-selected={current}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(place)}
              className={cn(
                "w-full rounded-xl px-3 py-2.5 text-left transition",
                current
                  ? "bg-forest text-cream hover:bg-forest"
                  : cn("hover:bg-warm", focused && "bg-warm"),
              )}
            >
              <span className="block text-sm font-medium">{place.main}</span>
              {place.secondary ? (
                <span
                  className={cn("mt-0.5 block text-xs", current ? "text-cream/80" : "text-muted")}
                >
                  {place.secondary}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative w-full",
        bare ? "flex min-w-0 items-center" : "min-w-[16rem] shrink-0 sm:w-72 lg:w-80",
        className,
      )}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          const next = e.target.value;
          if (commitOnly) setDraft(next);
          else onChange(next);
          onOpen?.();
          setOpen(true);
        }}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => {
          if (!commitOnly) return;
          if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
          setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            if (commitOnly) setDraft(value);
            return;
          }
          if (e.key === "Enter") {
            if (listOpen) {
              e.preventDefault();
              const place = suggestions[active];
              if (place) pick(place);
              return;
            }
            if (commitOnly) {
              e.preventDefault();
              commit(draft.trim());
            }
            return;
          }
          if (!listOpen) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(suggestions.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          }
        }}
        className={cn(
          "relative z-[21] w-full text-sm outline-none placeholder:text-muted",
          bare
            ? cn(
                "h-5 bg-transparent p-0 font-medium leading-5 text-forest placeholder:font-medium",
                hasText ? "pr-7" : "pr-0",
              )
            : cn(
                "h-9 rounded-full border border-line bg-white pl-9 focus:border-forest",
                hasText ? "pr-9" : "pr-4",
              ),
        )}
        placeholder={placeholder}
        aria-label={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listId}
        aria-activedescendant={listOpen ? `${listId}-${active}` : undefined}
        autoComplete="off"
      />
      {bare ? null : (
        <Search
          size={15}
          strokeWidth={2}
          className="pointer-events-none absolute left-3 top-1/2 z-[22] -translate-y-1/2 text-muted"
        />
      )}
      {hasText ? (
        <button
          type="button"
          aria-label="Clear location"
          className={cn(
            "absolute top-1/2 z-[22] flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-warm hover:text-forest",
            bare ? "right-0" : "right-2",
          )}
          onClick={clear}
        >
          <X size={14} strokeWidth={2} />
        </button>
      ) : null}
      {listOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-10 cursor-default"
          aria-label="Close"
          onClick={() => setOpen(false)}
        />
      ) : null}
      {listOpen ? (listRoot ? createPortal(listbox, listRoot) : listbox) : null}
    </div>
  );
}
