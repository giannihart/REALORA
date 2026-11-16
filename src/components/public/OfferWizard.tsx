"use client";

import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/shared/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { resolveBuyingCapacity } from "@/lib/buying-capacity";
import { formatMoney, formatNumber } from "@/lib/format";
import { likelihoodPercent, scoreOffer } from "@/lib/scoring";
import { useAppData } from "@/lib/data/use-app-data";
import { isLocalDataMode } from "@/lib/data/mode";
import type { FinancingType, Listing } from "@/lib/types";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ActionFailure } from "@/lib/actions/errors";
import { acknowledgeAgencyDisclosureAction } from "@/lib/actions/disclosure";

const fieldClass =
  "mt-2 h-11 w-full rounded-[14px] border border-line bg-cream px-3.5 nums text-sm text-forest outline-none focus:border-forest";

function MoneyInput({
  label,
  hint,
  value,
  onChange,
  error,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  error?: string;
}) {
  return (
    <label className="block text-sm font-medium text-forest">
      {label}
      {hint ? <span className="mt-0.5 block text-xs font-normal text-muted">{hint}</span> : null}
      <input
        type="text"
        inputMode="numeric"
        value={value ? `$ ${formatNumber(value)}` : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(digits ? Number(digits) : 0);
        }}
        className={fieldClass}
        aria-label={label}
      />
      {error ? <p className="mt-1 text-sm text-[#9b2c2c]">{error}</p> : null}
    </label>
  );
}

function PercentInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(Number.isFinite(value) ? String(value) : "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(Number.isFinite(value) ? String(value) : "");
  }, [value, focused]);

  const display = draft === "" ? "" : focused ? draft : `${draft} %`;

  return (
    <label className="block text-sm font-medium text-forest">
      {label}
      {hint ? <span className="mt-0.5 block text-xs font-normal text-muted">{hint}</span> : null}
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setDraft(Number.isFinite(value) ? String(value) : "");
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.]/g, "");
          const parts = raw.split(".");
          const cleaned =
            parts.length <= 1
              ? raw
              : `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
          setDraft(cleaned);
          if (cleaned === "" || cleaned === ".") {
            onChange(0);
            return;
          }
          const next = Number(cleaned);
          if (Number.isFinite(next)) onChange(Math.min(100, next));
        }}
        className={fieldClass}
        aria-label={label}
      />
    </label>
  );
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultCloseIso() {
  const d = new Date();
  d.setDate(d.getDate() + 45);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatCloseLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function OfferWizard({
  listing,
  open,
  onOpenChange,
}: {
  listing: Listing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const user = useAppData((s) => s.user);
  const submitOffer = useAppData((s) => s.submitOffer);
  const buyingPower = useAppData((s) => s.buyingPower);
  const capacity = resolveBuyingCapacity({ user, buyingPower });
  const budget = capacity?.amount ?? null;
  const [step, setStep] = useState(1);
  const [price, setPrice] = useState(listing.price);
  const [emd, setEmd] = useState(Math.round(listing.price * 0.05));
  const [emdTouched, setEmdTouched] = useState(false);
  const [emdCustomOpen, setEmdCustomOpen] = useState(false);
  const [emdCustomPct, setEmdCustomPct] = useState("");
  const [closeDate, setCloseDate] = useState(defaultCloseIso());
  const [financing, setFinancing] = useState<FinancingType>("Conventional");
  const [downPercent, setDownPercent] = useState(20);
  const [inspection, setInspection] = useState(true);
  const [finContingency, setFinContingency] = useState(true);
  const [docsReady, setDocsReady] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [disclosure, setDisclosure] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPrice(listing.price);
    setEmd(Math.round(listing.price * 0.05));
    setEmdTouched(false);
    setEmdCustomOpen(false);
    setEmdCustomPct("");
    setCloseDate(defaultCloseIso());
  }, [open, listing.id, listing.price]);

  const priceN = price;
  const emdN = emd;
  const downN = downPercent;
  const emdPct = priceN > 0 ? Math.round((emdN / priceN) * 1000) / 10 : 0;
  const downDollars = Math.round((priceN * downN) / 100);
  const loanAmount = Math.max(0, priceN - downDollars);
  const overBudget = budget != null && priceN > budget;

  const draft = useMemo(
    () => ({
      listingId: listing.id,
      price: priceN,
      emd: emdN,
      closeDate,
      financing,
      downPercent: financing === "Cash" ? 100 : downN,
      inspectionContingency: inspection,
      financingContingency: financing === "Cash" ? false : finContingency,
      // Financed verification is AE-confirmed on Documents — never from this wizard alone.
      verifiedFunds: financing === "Cash",
    }),
    [listing.id, priceN, emdN, closeDate, financing, downN, inspection, finContingency],
  );

  const scored = scoreOffer(draft);
  const winPct = likelihoodPercent(scored.score);

  function validateStep1() {
    const next: Record<string, string> = {};
    if (!(priceN > 0)) next.price = "Enter an offer price greater than $0.";
    if (!(emdN > 0)) next.emd = "Earnest money deposit is required.";
    if (emdN > priceN) next.emd = "Deposit cannot exceed the offer price.";
    if (!closeDate || closeDate <= todayIso()) {
      next.closeDate = "Choose a close date after today.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateStep2() {
    const next: Record<string, string> = {};
    if (financing !== "Cash" && (!(downN > 0) || downN > 100)) {
      next.down = "Down payment must be between 1% and 100%.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function reset() {
    setStep(1);
    setConfirm(false);
    setErrors({});
    setEmdTouched(false);
    setEmdCustomOpen(false);
    setEmdCustomPct("");
    setDocsReady(false);
  }

  function updatePrice(next: number) {
    setPrice(next);
    if (!emdTouched) setEmd(Math.round(next * 0.05));
  }

  const stepTitle =
    step === 1 ? "Terms" : step === 2 ? "Financing" : step === 3 ? "Review" : "Confirm";

  if (open && user.signedIn && !user.verifiedId) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[rgba(11,31,26,0.45)] p-4">
            <Dialog.Content className="anim-rise shadow-raised relative w-[min(440px,100%)] rounded-[24px] border border-line bg-white p-8">
              <Dialog.Title className="text-xl font-medium tracking-tight">
                Verify before offering
              </Dialog.Title>
              <p className="mt-3 text-muted">
                ID check is required before offering. Ownership check is required before
                listing.
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Not now
                </Button>
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    router.push(`/auth?next=/listing/${listing.id}&intent=offer`);
                  }}
                >
                  Start verification
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  if (open && !user.signedIn) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[rgba(11,31,26,0.45)] p-4">
            <Dialog.Content className="anim-rise shadow-raised relative w-[min(440px,100%)] rounded-[24px] border border-line bg-white p-8">
              <Dialog.Title className="text-xl font-medium tracking-tight">
                Sign in to buy now
              </Dialog.Title>
              <p className="mt-3 text-muted">
                Create a buyer session, complete the ID check, then send a structured term
                sheet.
              </p>
              <div className="mt-6 flex justify-end">
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    router.push(`/auth?next=/listing/${listing.id}&intent=offer`);
                  }}
                >
                  Continue
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(v) => {
          if (!v) reset();
          onOpenChange(v);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[rgba(11,31,26,0.45)] p-4">
            <Dialog.Content className="anim-rise shadow-raised relative my-auto max-h-[min(96vh,920px)] w-[min(720px,100%)] overflow-auto rounded-[24px] border border-line bg-white p-6 sm:p-8">
              <p className="text-xs font-semibold text-muted">
                Step {step} of 4
              </p>
              <Dialog.Title className="mt-1 font-sans text-3xl font-medium tracking-tight text-forest">
                {stepTitle}
              </Dialog.Title>

              <div className="mt-5 overflow-hidden rounded-[20px] border border-line bg-cream">
                <div className="flex flex-col sm:flex-row">
                  {listing.photos[0] ? (
                    <div className="relative aspect-[16/10] shrink-0 overflow-hidden bg-sand sm:aspect-auto sm:h-[148px] sm:w-[200px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={listing.photos[0]}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        style={{
                          objectPosition: listing.objectPosition ?? "50% 50%",
                        }}
                      />
                      <div className="absolute inset-y-0 right-0 hidden w-8 bg-gradient-to-r from-transparent to-white/40 sm:block" />
                    </div>
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col justify-center px-5 py-4 sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                      <p className="min-w-0 truncate text-2xl font-medium tracking-tight text-forest">
                        {listing.address}
                      </p>
                      <div className="flex shrink-0 items-stretch">
                        {(
                          [
                            { value: String(listing.beds), label: "beds" },
                            {
                              value:
                                listing.baths % 1 === 0
                                  ? String(listing.baths)
                                  : listing.baths.toFixed(1),
                              label: "baths",
                            },
                            {
                              value: formatNumber(listing.sqft),
                              label: "sqft",
                            },
                          ] as const
                        ).map((stat, i) => (
                          <div
                            key={stat.label}
                            className={
                              i === 0
                                ? "px-3 text-center first:pl-0"
                                : "border-l border-line px-3 text-center last:pr-0"
                            }
                          >
                            <p className="nums text-lg font-medium leading-none tracking-tight text-forest">
                              {stat.value}
                            </p>
                            <p className="mt-1 text-[11px] text-muted">
                              {stat.label}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-muted">
                      {listing.neighborhood
                        ? `${listing.neighborhood} · `
                        : ""}
                      {listing.city}, {listing.state} {listing.zip}
                    </p>
                    <p className="mt-2 text-[13px] text-forest/80">
                      Asking price{" "}
                      <span className="nums font-semibold text-forest">
                        {formatMoney(listing.price)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {step === 1 ? (
                <div className="mt-5 space-y-3.5">
                  {budget != null ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-full bg-lime px-4 py-2.5">
                      <p className="text-sm font-semibold text-forest">
                        {capacity?.source === "preapproval"
                          ? capacity.shortLabel
                          : `Buying Power · ${formatMoney(budget)}`}
                      </p>
                      <p className="text-xs font-semibold text-forest">
                        {overBudget ? "Above your budget" : "In range"}
                      </p>
                    </div>
                  ) : null}

                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <MoneyInput
                      label="Offer price"
                      hint={`Asking ${formatMoney(listing.price)}`}
                      value={price}
                      onChange={updatePrice}
                      error={errors.price}
                    />
                    <div>
                      <MoneyInput
                        label="Earnest money deposit"
                        hint={`${emdPct}% of offer · attorney escrow`}
                        value={emd}
                        onChange={(n) => {
                          setEmdTouched(true);
                          setEmd(n);
                        }}
                        error={errors.emd}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {[5, 10, 20].map((pct) => {
                          const selected =
                            !emdCustomOpen &&
                            priceN > 0 &&
                            Math.round((priceN * pct) / 100) === emd;
                          return (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => {
                                setEmdTouched(true);
                                setEmdCustomOpen(false);
                                setEmdCustomPct("");
                                setEmd(Math.round((priceN * pct) / 100));
                              }}
                              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                selected
                                  ? "bg-lime text-forest"
                                  : "bg-cream text-forest hover:bg-warm"
                              }`}
                            >
                              {pct}%
                            </button>
                          );
                        })}
                        {emdCustomOpen ? (
                          <label className="inline-flex items-center gap-0.5 rounded-full bg-lime px-3 py-1.5 text-xs font-medium text-forest">
                            <input
                              type="text"
                              inputMode="decimal"
                              autoFocus
                              value={emdCustomPct}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d.]/g, "");
                                const parts = raw.split(".");
                                const cleaned =
                                  parts.length <= 1
                                    ? raw
                                    : `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
                                setEmdCustomPct(cleaned);
                              }}
                              onBlur={() => {
                                const pct = Number(emdCustomPct);
                                if (
                                  emdCustomPct.trim() === "" ||
                                  !Number.isFinite(pct) ||
                                  pct <= 0
                                ) {
                                  setEmdCustomOpen(false);
                                  setEmdCustomPct("");
                                  return;
                                }
                                setEmdTouched(true);
                                setEmd(Math.round((priceN * Math.min(pct, 100)) / 100));
                                setEmdCustomPct(String(Math.min(pct, 100)));
                                setEmdCustomOpen(false);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              placeholder="0"
                              className="w-7 bg-transparent p-0 text-center nums text-xs font-medium leading-none text-forest outline-none"
                              aria-label="Custom deposit percent"
                            />
                            <span>%</span>
                          </label>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const isPreset = [5, 10, 20].some(
                                (pct) =>
                                  priceN > 0 &&
                                  Math.round((priceN * pct) / 100) === emd,
                              );
                              setEmdCustomOpen(true);
                              setEmdCustomPct(
                                !isPreset && emdPct > 0 ? String(emdPct) : "",
                              );
                            }}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                              priceN > 0 &&
                              ![5, 10, 20].some(
                                (pct) => Math.round((priceN * pct) / 100) === emd,
                              )
                                ? "bg-lime text-forest"
                                : "bg-cream text-forest hover:bg-warm"
                            }`}
                          >
                            Custom
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <label className="block text-sm font-medium text-forest">
                    Proposed close date
                    <span className="mt-0.5 block text-xs font-normal text-muted">
                      Target closing day — adjustable later with counsel.
                    </span>
                    <input
                      type="date"
                      min={todayIso()}
                      value={closeDate}
                      onChange={(e) => setCloseDate(e.target.value)}
                      className={fieldClass}
                    />
                    {closeDate ? (
                      <p className="mt-1 text-xs text-muted">{formatCloseLabel(closeDate)}</p>
                    ) : null}
                    {errors.closeDate ? (
                      <p className="mt-1 text-sm text-[#9b2c2c]">{errors.closeDate}</p>
                    ) : null}
                  </label>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="mt-6 space-y-4">
                  <fieldset>
                    <legend className="text-sm font-medium text-forest">Payment path</legend>
                    <p className="mt-1 text-xs text-muted">
                      Cash usually reads strongest. Financed offers climb when pre-approval is
                      AE-confirmed in Documents.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["Cash", "Conventional", "Jumbo"] as FinancingType[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFinancing(f)}
                          className={`rounded-full px-4 py-2 text-sm font-semibold ${
                            financing === f ? "bg-forest-deep text-cream" : "bg-warm text-forest"
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {financing !== "Cash" ? (
                    <>
                      <PercentInput
                        label="Down payment"
                        hint="Percent of offer price. Higher down often improves certainty."
                        value={downPercent}
                        onChange={setDownPercent}
                      />
                      {errors.down ? (
                        <p className="text-sm text-[#9b2c2c]">{errors.down}</p>
                      ) : null}
                      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-cream px-3.5 py-3 text-sm">
                        <div>
                          <dt className="text-xs text-muted">Down payment</dt>
                          <dd className="mt-0.5 font-medium text-forest">
                            {formatMoney(downDollars)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Loan amount</dt>
                          <dd className="mt-0.5 font-medium text-forest">
                            {formatMoney(loanAmount)}
                          </dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <p className="rounded-xl border border-line bg-cream px-3.5 py-3 text-xs leading-5 text-muted">
                      Cash purchase — no mortgage contingency. Proof of funds is confirmed by
                      Realora on the Documents page, not by self-attesting here.
                    </p>
                  )}

                  <Checkbox checked={inspection} onChange={setInspection}>
                    Inspection contingency
                  </Checkbox>
                  {financing !== "Cash" ? (
                    <Checkbox checked={finContingency} onChange={setFinContingency}>
                      Financing contingency
                    </Checkbox>
                  ) : null}
                  <Checkbox checked={docsReady} onChange={setDocsReady}>
                    I&apos;ll upload{" "}
                    {financing === "Cash" ? "proof of funds" : "pre-approval"} in Documents
                  </Checkbox>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="mt-6 space-y-4">
                  <dl className="space-y-3 rounded-xl border border-line bg-cream px-3.5 py-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Offer price</dt>
                      <dd className="font-medium text-forest">{formatMoney(priceN)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Earnest money</dt>
                      <dd className="font-medium text-forest">
                        {formatMoney(emdN)}{" "}
                        <span className="font-normal text-muted">({emdPct}%)</span>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Close date</dt>
                      <dd className="font-medium text-forest">
                        {formatCloseLabel(closeDate)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Financing</dt>
                      <dd className="font-medium text-forest">
                        {financing}
                        {financing !== "Cash"
                          ? ` · ${draft.downPercent}% down (${formatMoney(downDollars)})`
                          : ""}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Contingencies</dt>
                      <dd className="text-right font-medium text-forest">
                        Inspection {inspection ? "yes" : "no"}
                        <br />
                        Financing {draft.financingContingency ? "yes" : "no"}
                      </dd>
                    </div>
                  </dl>
                  <div className="rounded-2xl bg-lime px-4 py-4">
                    <p className="text-xs font-medium text-forest/70">
                      Likelihood of winning
                    </p>
                    <p className="nums mt-2 text-4xl font-medium tracking-tight text-forest sm:text-5xl">
                      {winPct}%
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-forest/15">
                      <div
                        className="h-full rounded-full bg-forest transition-[width]"
                        style={{ width: `${winPct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-forest">
                      {scored.label}
                    </p>
                    <p className="mt-1 text-xs text-forest/70">
                      Estimate from price, deposit, financing, contingencies, and close
                      timing — not a guarantee.
                    </p>
                  </div>
                </div>
              ) : null}

              {step === 4 ? (
                <div className="mt-6 space-y-4">
                  <p className="text-base leading-7 text-forest/80">
                    Submit this term sheet for{" "}
                    <span className="font-semibold text-forest">{listing.address}</span> at{" "}
                    <span className="font-semibold text-forest">{formatMoney(priceN)}</span>?
                    It appears instantly on the seller Offers board with your certainty note.
                  </p>
                </div>
              ) : null}

              <div className="mt-8 flex justify-between">
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (step === 1) onOpenChange(false);
                    else setStep((s) => s - 1);
                  }}
                >
                  Back
                </Button>
                {step < 4 ? (
                  <Button
                    variant="lime"
                    onClick={() => {
                      if (step === 1 && !validateStep1()) return;
                      if (step === 2 && !validateStep2()) return;
                      setStep((s) => s + 1);
                    }}
                  >
                    Continue
                  </Button>
                ) : (
                  <Button variant="lime" onClick={() => setConfirm(true)}>
                    Submit offer
                  </Button>
                )}
              </div>
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Submit this offer?"
        body="Your term sheet will land on the seller Offers page with a certainty note."
        confirmLabel="Submit offer"
        confirmPhrase="submit"
        onConfirm={() => {
          void Promise.resolve(submitOffer(draft))
            .then(() => {
              toast("Offer submitted. The seller can review it now.");
              reset();
              onOpenChange(false);
              router.push(isLocalDataMode() ? "/portal/seller/offers" : "/portal/buyer");
            })
            .catch((err: unknown) => {
              if (err instanceof ActionFailure && err.code === "disclosure_required") {
                setPendingSubmit(true);
                setDisclosure(true);
              }
            });
        }}
      />
      <ConfirmDialog
        open={disclosure}
        onOpenChange={setDisclosure}
        title="Agency Disclosure required"
        body="New York law requires an Agency Disclosure acknowledgment before a buyer can submit an offer. Acknowledge to continue."
        confirmLabel="Acknowledge and continue"
        onConfirm={() => {
          void acknowledgeAgencyDisclosureAction({ listingId: listing.id }).then((res) => {
            if (!res.ok) {
              toast(res.message);
              return;
            }
            setDisclosure(false);
            if (pendingSubmit) {
              void Promise.resolve(submitOffer(draft))
                .then(() => {
                  toast("Offer submitted. The seller can review it now.");
                  reset();
                  onOpenChange(false);
                  router.push(isLocalDataMode() ? "/portal/seller/offers" : "/portal/buyer");
                })
                .catch(() => undefined);
            }
          });
        }}
      />
    </>
  );
}
