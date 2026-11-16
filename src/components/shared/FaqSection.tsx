"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/format";

export type FaqItem = {
  q: string;
  a: string;
};

type FaqSectionProps = {
  title?: string;
  items: readonly FaqItem[];
  askPlaceholder?: string;
  className?: string;
};

const STUB_ANSWER =
  "We’re wiring live answers here. For now, use the questions above or reach us from your portal.";

export function FaqSection({
  title = "Common questions",
  items,
  askPlaceholder = "Ask anything…",
  className,
}: FaqSectionProps) {
  const [open, setOpen] = useState<number | null>(0);
  const [askDraft, setAskDraft] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askPending, setAskPending] = useState(false);
  const [askOpen, setAskOpen] = useState(true);

  return (
    <div className={cn(className)}>
      <h2 className="font-sans text-3xl font-medium tracking-tight text-forest">{title}</h2>
      <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-white">
        {items.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className={cn(i > 0 && "border-t border-line")}>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
              >
                <span className="text-sm font-semibold text-forest">{item.q}</span>
                {isOpen ? (
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                ) : (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                )}
              </button>
              {isOpen ? (
                <p className="px-5 pb-5 text-sm leading-6 text-muted">{item.a}</p>
              ) : null}
            </div>
          );
        })}
        <div className="border-t border-line">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = askDraft.trim();
              if (!q || askPending) return;
              setAskPending(true);
              setAskAnswer(null);
              setAskOpen(true);
              // Chat API hook-up later — answer fills the same slot as other FAQ answers.
              window.setTimeout(() => {
                setAskAnswer(STUB_ANSWER);
                setAskPending(false);
              }, 400);
            }}
          >
            <div className="flex w-full items-start justify-between gap-4 px-5 py-4">
              <input
                type="text"
                value={askDraft}
                onChange={(e) => setAskDraft(e.target.value)}
                placeholder={askPlaceholder}
                disabled={askPending}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-forest outline-none placeholder:text-forest/40 disabled:opacity-60"
                aria-label="Ask anything"
              />
              {askAnswer && !askPending ? (
                <button
                  type="button"
                  className="shrink-0 text-muted"
                  onClick={() => setAskOpen((o) => !o)}
                  aria-expanded={askOpen}
                  aria-label={askOpen ? "Hide answer" : "Show answer"}
                >
                  {askOpen ? (
                    <ChevronDown className="mt-0.5 h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4" aria-hidden />
                  )}
                </button>
              ) : (
                <button
                  type="submit"
                  className="shrink-0 text-muted disabled:opacity-40"
                  disabled={askPending || !askDraft.trim()}
                  aria-label="Ask question"
                >
                  <ChevronRight className="mt-0.5 h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          </form>
          {askPending ? (
            <p className="px-5 pb-5 text-sm leading-6 text-muted">Looking that up…</p>
          ) : askAnswer && askOpen ? (
            <p className="px-5 pb-5 text-sm leading-6 text-muted">{askAnswer}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
