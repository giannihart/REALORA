"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { LenderQuestionnaire, MORTGAGE_STEP_LABELS } from "@/components/mortgage/LenderQuestionnaire";
import { FAQ, FAQ_ASK_PLACEHOLDER, FOOT_PRINT } from "@/components/mortgage/copy";
import { FaqSection } from "@/components/shared/FaqSection";
import { cn, formatMoney } from "@/lib/format";
import type { LenderPacketBuyerStatus } from "@/lib/lender-packet/types";

type Phase = "entry" | "flow" | "crunching" | "gauge" | "done";

const BANK_ICON = "/mortgage-bank-v8.png";

const ENTRY_CARDS = [
  {
    title: "Where to shop in your range",
    body: "Weigh a lower or higher price against your real numbers.",
  },
  {
    title: "Your monthly payment",
    body: "See how down payment and loan program shift it.",
  },
  {
    title: "Your cash to close",
    body: "What goes out up front, and what to keep in reserve.",
  },
] as const;

const ASSURANCE =
  "Takes about 5 minutes · No credit impact · Your info goes only to the lender and is never sold.";

const GAUGE_LINE =
  "Our gauge, from the income, debts, and cash you just gave us — not a lender's number. It becomes your lender's number the day your pre-approval is confirmed.";

const DONE_NEXT =
  "Your lender will reach out directly — that conversation is yours, off Realora. When your pre-approval letter arrives, upload it on your Financing page, and your estimate becomes your lender's number everywhere on Realora.";

/** Shared page chrome so entry / flow / done titles share the same top alignment. */
function MortgageHeader({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BANK_ICON}
        alt=""
        className="pointer-events-none absolute -top-2 right-0 h-24 w-24 object-contain sm:-top-3 sm:h-32 sm:w-32"
      />
      <div className="pr-[6.75rem] sm:pr-[9.25rem]">
        <h1 className="font-sans text-3xl font-medium tracking-tight">{title}</h1>
        {subtitle}
      </div>
    </div>
  );
}

export function MortgageIntakeView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("entry");
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowStep, setFlowStep] = useState(1);
  const [gaugeAmount, setGaugeAmount] = useState(0);
  const [resumeAfterGauge, setResumeAfterGauge] = useState(0);
  const [done, setDone] = useState<{
    status: LenderPacketBuyerStatus;
    lenderName: string;
  } | null>(null);

  useEffect(() => {
    if (searchParams.get("lenderPacket") === "1") {
      setPhase("flow");
      setFlowOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (phase !== "crunching") return;
    const t = window.setTimeout(() => setPhase("gauge"), 900);
    return () => window.clearTimeout(t);
  }, [phase]);

  function start() {
    setPhase("flow");
    setFlowOpen(true);
  }

  const stepLabel = MORTGAGE_STEP_LABELS[flowStep - 1] ?? "Questions";
  const showProgress = phase === "flow" || phase === "crunching" || phase === "gauge";

  return (
    <div className="min-h-[calc(100svh-3.5rem)]">
      <div className="mx-auto max-w-xl px-4 py-12">
        {phase === "entry" ? (
          <>
            <MortgageHeader
              title="Get a mortgage"
              subtitle={<p className="mt-2 text-sm leading-6 text-muted">{ASSURANCE}</p>}
            />
            <div className="mt-8 overflow-hidden rounded-3xl border border-line bg-white">
              {ENTRY_CARDS.map((card, i) => (
                <div
                  key={card.title}
                  className={cn("px-5 py-5", i > 0 && "border-t border-line")}
                >
                  <p className="text-base font-semibold text-forest">{card.title}</p>
                  <p className="mt-1.5 text-sm leading-6 text-muted">{card.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <Button type="button" variant="lime" onClick={start}>
                Get started
              </Button>
            </div>
            <div className="mt-10 border-t border-line pt-6">
              <p className="text-[13px] leading-6 text-muted">{FOOT_PRINT}</p>
            </div>

            <FaqSection
              className="mt-14"
              items={FAQ}
              askPlaceholder={FAQ_ASK_PLACEHOLDER}
            />
          </>
        ) : null}

        {showProgress ? (
          <>
            <MortgageHeader
              title="Get a mortgage"
              subtitle={
                <p className="mt-2 text-sm text-muted">
                  Answer the questions a lender will ask anyway — one packet, one lender.
                </p>
              }
            />
            <div className="mt-6">
              <Progress value={(flowStep / MORTGAGE_STEP_LABELS.length) * 100} />
              <p className="mt-2 text-xs text-muted">
                {phase === "crunching" || phase === "gauge"
                  ? `Step ${flowStep} of ${MORTGAGE_STEP_LABELS.length} · Your number`
                  : `Step ${flowStep} of ${MORTGAGE_STEP_LABELS.length} · ${stepLabel}`}
              </p>
            </div>
            <div className="mt-8 space-y-3 rounded-3xl border border-line bg-white p-6">
              {phase === "crunching" ? (
                <div className="flex min-h-[12rem] items-center justify-center text-center">
                  <p className="font-sans text-2xl tracking-tight text-forest">
                    Running your numbers…
                  </p>
                </div>
              ) : null}
              {phase === "gauge" ? (
                <>
                  <p className="text-xs font-medium text-muted">
                    Your estimated buying power
                  </p>
                  <p className="nums mt-2 text-4xl font-semibold tracking-tight text-forest sm:text-5xl">
                    {formatMoney(gaugeAmount)}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-muted">{GAUGE_LINE}</p>
                  <div className="flex justify-between pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="px-2.5"
                      onClick={() => setPhase("flow")}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      type="button"
                      variant="lime"
                      onClick={() => {
                        setResumeAfterGauge((n) => n + 1);
                        setPhase("flow");
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </>
              ) : null}
              <div
                className={
                  phase === "crunching" || phase === "gauge" ? "hidden" : undefined
                }
              >
                <LenderQuestionnaire
                  open={flowOpen}
                  chrome="page"
                  resumeAfterGauge={resumeAfterGauge}
                  onStepChange={setFlowStep}
                  onGaugeReveal={(amount) => {
                    setGaugeAmount(amount);
                    setPhase("crunching");
                  }}
                  onComplete={(result) => {
                    setDone(result);
                    setPhase("done");
                    setFlowOpen(false);
                    if (searchParams.get("lenderPacket") === "1") {
                      router.replace("/mortgage");
                    }
                  }}
                  onClose={() => {
                    setFlowOpen(false);
                    setPhase("entry");
                    if (searchParams.get("lenderPacket") === "1") {
                      router.replace("/mortgage");
                    }
                  }}
                  onAlreadyPreapproved={() => {
                    setFlowOpen(false);
                    router.push("/portal/buyer/documents");
                  }}
                />
              </div>
            </div>
            <div className="mt-10 border-t border-line pt-6">
              <p className="text-[13px] leading-6 text-muted">{FOOT_PRINT}</p>
            </div>
          </>
        ) : null}

        {phase === "done" && done ? (
          <>
            <MortgageHeader
              title={done.status === "sent" ? "Packet sent" : "Packet prepared"}
              subtitle={
                <p className="mt-2 text-sm text-muted">
                  {done.status === "sent"
                    ? "Your introduction packet was sent."
                    : "Your introduction packet is prepared — email delivery is not live yet, so nothing was claimed as sent."}
                </p>
              }
            />
            <div className="mt-8 space-y-3 rounded-3xl border border-line bg-white p-6">
              <p className="text-sm leading-6 text-forest">
                {done.status === "sent" ? "Sent" : "Prepared"} for{" "}
                <span className="font-medium">{done.lenderName}</span> at your direction, with
                your consent on record.
              </p>
              <p className="text-sm leading-6 text-muted">{DONE_NEXT}</p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button href="/buy?withinBuyingPower=1" variant="lime">
                  See homes within your number
                </Button>
                <Button href="/portal/buyer/financing" variant="outline">
                  Go to my Financing page
                </Button>
              </div>
            </div>
            <div className="mt-10 border-t border-line pt-6">
              <p className="text-[13px] leading-6 text-muted">{FOOT_PRINT}</p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
