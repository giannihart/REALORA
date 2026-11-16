"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FaqSection } from "@/components/shared/FaqSection";
import { cn } from "@/lib/format";
import {
  BUY_CHAPTERS,
  FAQ,
  FAQ_ASK_PLACEHOLDER,
  FOOT_PRINT,
  PILLARS,
  SELL_CHAPTERS,
} from "./copy";
import {
  BuyingPowerStory,
  EscrowStory,
  IntakeStepsStory,
  ListingLiveStory,
  MortgageStory,
  NetKeepStory,
  OfferComparisonStory,
  TimelineStory,
  VerifyStory,
} from "./StoryVisuals";

type PathId = "sell" | "buy";

const MAGNIFIER = "/how-it-works-magnifier-v3.png";

export function HowItWorksView() {
  const [path, setPath] = useState<PathId>("sell");
  const chapters = path === "buy" ? BUY_CHAPTERS : SELL_CHAPTERS;

  return (
    <div id="main" className="min-h-[calc(100svh-3.5rem)] overflow-x-hidden bg-cream pb-16">
      <div className="mx-auto max-w-xl px-4 pb-8 pt-12">
        <Reveal>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MAGNIFIER}
              alt=""
              className="pointer-events-none absolute top-0 right-0 h-24 w-24 object-contain sm:-top-1 sm:h-32 sm:w-32"
            />
            <div className="pr-[6.75rem] sm:pr-[9.25rem]">
              <h1 className="font-sans text-3xl font-medium tracking-tight text-forest">
                See how Realora works
              </h1>
              <div className="mt-1 flex items-baseline gap-x-1.5 font-sans text-3xl font-medium tracking-tight text-forest">
                <span>for</span>
                <PathDropdown path={path} onChange={setPath} />
              </div>
            </div>
            <p className="mt-2 pr-[6.75rem] text-sm leading-6 text-muted sm:pr-[9.25rem]">
              Realora represents the seller and
              coordinates both sides from listing to close.
            </p>
          </div>
          <div className="mt-8 overflow-hidden rounded-3xl border border-line bg-white">
            {PILLARS.map((pillar, i) => (
              <div
                key={pillar.title}
                className={cn("px-5 py-5", i > 0 && "border-t border-line")}
              >
                <p className="text-base font-semibold text-forest">{pillar.title}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      <section id="path" className="scroll-mt-20 pb-4">
        <ol>
          {chapters.map((chapter, i) => (
            <Step
              key={`${path}-${chapter.id}`}
              chapter={chapter}
              side={i % 2 === 0 ? "left" : "right"}
              first={i === 0}
              visual={<StepVisual path={path} stepId={chapter.id} />}
            />
          ))}
        </ol>

        <Reveal className="mx-auto mt-10 max-w-xl px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                window.scrollTo({ top: 0, behavior: "smooth" })
              }
              className="rounded-full px-4 py-2 text-sm font-medium text-forest transition hover:bg-warm"
            >
              Back to top
            </button>
            {path === "sell" ? (
              <Button href="/sell" variant="lime">
                Sell with Realora
              </Button>
            ) : (
              <Button href="/buy" variant="lime">
                Browse homes
              </Button>
            )}
          </div>
          <div className="mt-10 border-t border-line pt-6">
            <p className="text-[13px] leading-6 text-muted">{FOOT_PRINT}</p>
          </div>
        </Reveal>
      </section>

      <div className="mx-auto max-w-xl px-4">
        <Reveal className="mt-14">
          <FaqSection
            items={FAQ}
            askPlaceholder={FAQ_ASK_PLACEHOLDER}
          />
        </Reveal>
      </div>
    </div>
  );
}

const PATH_LABELS = [
  { value: "sell" as const, label: "sellers" },
  { value: "buy" as const, label: "buyers" },
];

function PathDropdown({
  path,
  onChange,
}: {
  path: PathId;
  onChange: (next: PathId) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    function place() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 8, left: r.left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const display =
    PATH_LABELS.find((p) => p.value === path)?.label ?? "sellers";

  const menu =
    open && menuPos
      ? createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[80] cursor-default"
              aria-label="Close path menu"
              onClick={() => setOpen(false)}
            />
            <div
              role="listbox"
              className="fixed z-[90] w-max min-w-[7.5rem] overflow-y-auto rounded-2xl border border-line bg-white p-1.5 font-sans shadow-xl"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              <div className="space-y-1">
                {PATH_LABELS.map((opt) => {
                  const selected = path === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full rounded-xl px-2.5 py-2 text-left text-sm font-medium transition",
                        selected
                          ? "bg-forest text-cream"
                          : "text-forest hover:bg-warm",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div className="relative inline-flex shrink-0 items-baseline">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Choose sellers or buyers"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-baseline gap-0.5 font-sans text-3xl font-medium tracking-tight text-forest"
      >
        <span className="inline-block">{display}</span>
        <ChevronDown
          className={cn(
            "relative top-[0.05em] h-[0.65em] w-[0.65em] shrink-0 text-forest transition",
            open && "rotate-180",
          )}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}

function Step({
  chapter,
  side,
  first,
  visual,
}: {
  chapter: { id: string; label: string; title: string; body: string };
  side: "left" | "right";
  first?: boolean;
  visual: ReactNode;
}) {
  const ref = useRef<HTMLLIElement | null>(null);
  const [visible, setVisible] = useState(Boolean(first));

  useEffect(() => {
    if (first) return;
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -18% 0px", threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [first]);

  return (
    <li
      ref={ref}
      className={cn("relative pb-10 sm:pb-14", !first && "pt-10 sm:pt-14")}
    >
      {/* Angled product chrome — outside the max-w-xl text column */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 z-0 hidden w-64 xl:block",
          // Clear the centered max-w-xl (36rem) column + gap
          side === "left"
            ? "right-[calc(50%+1.25rem+18rem)]"
            : "left-[calc(50%+1.25rem+18rem)]",
          "hiw-float",
          side === "left" ? "hiw-float-left" : "hiw-float-right",
          visible && "hiw-float-in",
        )}
      >
        {visual}
      </div>

      <div
        className={cn(
          "relative z-10 mx-auto max-w-xl px-4",
          "hiw-reveal",
          visible && "hiw-reveal-in",
        )}
      >
        <div className="pt-6">
          <p className="text-xs font-medium text-muted">
            Step {chapter.label.replace(/^0/, "")}
          </p>
          <h3 className="mt-2 text-lg font-medium tracking-tight text-forest">
            {chapter.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">{chapter.body}</p>
        </div>

        {/* Below xl: component under the copy so nothing overlaps */}
        <div className="mt-5 max-w-sm xl:hidden">{visual}</div>
      </div>
    </li>
  );
}

function StepVisual({ path, stepId }: { path: PathId; stepId: string }) {
  if (path === "sell") {
    switch (stepId) {
      case "start":
        return <IntakeStepsStory />;
      case "keep":
        return <NetKeepStory />;
      case "live":
        return <ListingLiveStory />;
      case "offers":
        return <OfferComparisonStory />;
      case "contract":
        return <EscrowStory />;
      case "close":
        return (
          <TimelineStory
            items={[
              { title: "Listed", status: "Done" },
              { title: "Offer accepted", status: "Done" },
              { title: "Contract", status: "Now" },
              { title: "Closing", status: "Next" },
            ]}
          />
        );
      default:
        return null;
    }
  }

  switch (stepId) {
    case "start":
      return <ListingLiveStory />;
    case "power":
      return <BuyingPowerStory />;
    case "mortgage":
      return <MortgageStory />;
    case "verify":
      return <VerifyStory />;
    case "offer":
      return <OfferComparisonStory />;
    case "close":
      return (
        <TimelineStory
          items={[
            { title: "Home saved", status: "Done" },
            { title: "Financing ready", status: "Done" },
            { title: "Offer submitted", status: "Now" },
            { title: "Closing", status: "Next" },
          ]}
        />
      );
    default:
      return null;
  }
}

function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("hiw-reveal", visible && "hiw-reveal-in", className)}
    >
      {children}
    </div>
  );
}
