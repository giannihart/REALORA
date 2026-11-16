"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/format";

export type MenuSelectOption = {
  value: string;
  label: string;
  /** Optional section header — consecutive options with the same group share one header. */
  group?: string;
};

export function MenuSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Select",
  className,
  size = "md",
  hideLabel = false,
  menuAlign = "left",
}: {
  label: string;
  value: string;
  options: MenuSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
  hideLabel?: boolean;
  menuAlign?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((opt) => opt.value === value);
  const trigger = current?.label ?? placeholder;
  const compact = size === "sm";

  return (
    <div className={cn("block text-sm", open && "relative z-50", className)}>
      <span className={cn(hideLabel ? "sr-only" : "mb-1.5 block font-medium text-forest")}>
        {label}
      </span>
      <div className={cn("relative", !hideLabel && "mt-0")}>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={label}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex w-full items-center justify-between gap-2 border border-line bg-white text-left font-medium text-forest hover:bg-warm",
            compact
              ? "h-8 rounded-xl px-2 text-xs"
              : "h-11 rounded-xl px-3 text-sm",
          )}
        >
          <span className={cn("min-w-0 truncate", !current && "text-muted font-normal")}>{trigger}</span>
          <ChevronDown size={14} className={cn("shrink-0 transition", open && "rotate-180")} />
        </button>
        {open ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label={`Close ${label}`}
              onClick={() => setOpen(false)}
            />
            <div
              role="listbox"
              className={cn(
                "absolute z-50 max-h-64 overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-xl",
                menuAlign === "right" ? "right-0 left-auto" : "left-0 right-0",
                compact ? "top-9 min-w-[11rem]" : "top-12",
              )}
            >
              <div className="space-y-1">
                {options.map((opt, i) => {
                  const selected = opt.value === value;
                  const showGroup =
                    Boolean(opt.group) &&
                    (i === 0 || options[i - 1]?.group !== opt.group);
                  return (
                    <div key={opt.value}>
                      {showGroup ? (
                        <p className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted">
                          {opt.group}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          onChange(opt.value);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex w-full rounded-xl px-2.5 py-2 text-left font-medium",
                          compact ? "text-xs" : "text-sm",
                          selected
                            ? "bg-forest text-cream hover:bg-forest"
                            : "text-forest hover:bg-warm",
                        )}
                      >
                        {opt.label}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
