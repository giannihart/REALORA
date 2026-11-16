"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  BUYING_POWER_DEFAULTS,
  CREDIT_BANDS,
  computeBuyingPower,
  type BuyingPowerInputs,
  type CreditBandId,
} from "@/lib/buying-power";
import { resolveBuyingCapacity } from "@/lib/buying-capacity";
import { useAppData } from "@/lib/data/use-app-data";
import { formatMoney, formatNumber, monthFromIso, cn } from "@/lib/format";

const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-line bg-cream px-3.5 nums text-sm text-forest outline-none focus:border-forest";

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-forest">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value ? `$ ${formatNumber(value)}` : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(digits ? Number(digits) : 0);
        }}
        className={inputClass}
        aria-label={label}
      />
    </label>
  );
}

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(
    Number.isFinite(value) ? String(value) : "",
  );
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(Number.isFinite(value) ? String(value) : "");
  }, [value, focused]);

  const display = draft === "" ? "" : focused ? draft : `${draft} %`;

  return (
    <label className="block">
      <span className="text-sm font-medium text-forest">{label}</span>
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
          if (Number.isFinite(next)) onChange(next);
        }}
        className={inputClass}
        aria-label={label}
      />
    </label>
  );
}

export function BuyingPowerCard() {
  const profile = useAppData((s) => s.buyingPower);
  const user = useAppData((s) => s.user);
  const saveBuyingPower = useAppData((s) => s.saveBuyingPower);
  const [editing, setEditing] = useState(!profile);
  const [busy, setBusy] = useState(false);
  const [inputs, setInputs] = useState<BuyingPowerInputs>(
    profile ?? BUYING_POWER_DEFAULTS,
  );
  const capacity = useMemo(
    () => resolveBuyingCapacity({ user, buyingPower: profile }),
    [user, profile],
  );

  useEffect(() => {
    if (profile) setInputs(profile);
  }, [profile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#buying-power") {
      setEditing(true);
      requestAnimationFrame(() => {
        document.getElementById("buying-power")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }, []);

  const result = useMemo(() => computeBuyingPower(inputs), [inputs]);
  const savedResult = profile ? computeBuyingPower(profile) : null;
  const updated = profile?.updatedAt
    ? monthFromIso(profile.updatedAt.slice(0, 10))
    : null;

  function patch<K extends keyof BuyingPowerInputs>(
    key: K,
    value: BuyingPowerInputs[K],
  ) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    setBusy(true);
    try {
      await Promise.resolve(saveBuyingPower(inputs));
      toast("Buying Power saved.");
      setEditing(false);
    } catch {
      /* store toasts in supabase mode */
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="buying-power"
      className="scroll-mt-24 rounded-2xl border border-line bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">
            Buying Power
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-forest">
            {editing
              ? "Find your buying power"
              : capacity
                ? formatMoney(capacity.amount)
                : "Know your number"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-forest/75">
            {editing
              ? "A personalized estimate from your finances — no credit check. Saved here for every home you browse."
              : capacity
                ? capacity.source === "preapproval"
                  ? capacity.label
                  : savedResult
                    ? `Estimated buying power — our gauge, not a lender's number. Est. ${formatMoney(Math.round(savedResult.targetMonthlyPayment))}/mo PITI${updated ? ` · Updated ${updated}` : ""}`
                    : capacity.label
                : "Know what you can afford before you offer."}
          </p>
        </div>
        {!editing ? (
          <Button
            variant="lime"
            className="shrink-0 rounded-xl"
            onClick={() => setEditing(true)}
          >
            {profile ? "Update" : "Find my buying power"}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-5 space-y-5 border-t border-line pt-5">
          <div>
            <p className="nums text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
              {formatMoney(result.maxHomePrice)}
            </p>
            <p className="mt-1 nums text-sm text-forest">
              {formatMoney(Math.round(result.targetMonthlyPayment))}
              <span className="font-normal text-muted">/mo PITI estimate</span>
            </p>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted">
              Uses the standard 28/36 lender guidelines and an illustrative rate you
              can edit. Not a loan offer or credit decision.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField
              label="Annual household income"
              value={inputs.annualIncome}
              onChange={(n) => patch("annualIncome", n)}
            />
            <MoneyField
              label="Monthly debts"
              value={inputs.monthlyDebts}
              onChange={(n) => patch("monthlyDebts", n)}
            />
            <MoneyField
              label="Down payment saved"
              value={inputs.downPayment}
              onChange={(n) => patch("downPayment", n)}
            />
            <PercentField
              label="Illustrative rate"
              value={inputs.annualRatePct}
              onChange={(n) => patch("annualRatePct", n)}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-forest">Credit band</p>
            <p className="mt-1 text-xs text-muted">
              Saved for you and your lender. Not used in this estimate — no credit
              check.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CREDIT_BANDS.map((band) => (
                <button
                  key={band.id}
                  type="button"
                  onClick={() => patch("creditBand", band.id as CreditBandId)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition",
                    inputs.creditBand === band.id
                      ? "bg-forest text-cream"
                      : "bg-cream text-forest hover:bg-sand",
                  )}
                >
                  {band.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-forest">Term</p>
            <div className="mt-3 flex gap-2">
              {([30, 15] as const).map((years) => (
                <button
                  key={years}
                  type="button"
                  onClick={() => patch("termYears", years)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    inputs.termYears === years
                      ? "bg-forest text-cream"
                      : "bg-cream text-forest hover:bg-sand",
                  )}
                >
                  {`${years}-year`}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs leading-5 text-muted">
            This calculator never touches your credit. A lender&apos;s later
            pre-approval may involve a hard inquiry.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="lime"
              className="rounded-xl"
              disabled={busy}
              onClick={() => void onSave()}
            >
              {busy ? "Saving…" : "Save my Buying Power"}
            </Button>
            {profile ? (
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={busy}
                onClick={() => {
                  setInputs(profile);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
