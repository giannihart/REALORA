"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { PANEL_LENDERS } from "@/data/lenders";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  BUYING_POWER_DEFAULTS,
  computeBuyingPower,
} from "@/lib/buying-power";
import { sendLenderPacketAction } from "@/lib/actions/lender-packet";
import { useAppData } from "@/lib/data/use-app-data";
import { formatMoney, formatNumber, formatPhoneInput, cn } from "@/lib/format";
import {
  EMPTY_LENDER_PACKET_DRAFT,
  LENDER_PACKET_CONSENT_VERSION,
  LENDER_PACKET_CREDIT_BANDS,
  LENDER_PACKET_FUNDS_TIMING,
  LENDER_PACKET_OCCUPANCIES,
  LENDER_PACKET_PROPERTY_TYPES,
  LENDER_PACKET_TIMELINES,
  MORTGAGE_ADDRESS_STEP,
  MORTGAGE_DEBTS_STEP,
  MORTGAGE_REVIEW_STEP,
  MORTGAGE_STEP_LABELS,
  MORTGAGE_TOTAL_STEPS,
  type LenderPacketBuyerStatus,
  type LenderPacketCreditBand,
  type LenderPacketDraft,
  type LenderPacketFundsTiming,
  type LenderPacketOccupancy,
  type LenderPacketPropertyType,
  type LenderPacketTimeline,
} from "@/lib/lender-packet/types";

export { MORTGAGE_STEP_LABELS };

const DRAFT_KEY = "realora-lender-packet-draft";
const STEP_KEY = "realora-lender-packet-step";
const TOTAL_STEPS = MORTGAGE_TOTAL_STEPS;

const BOUNDARY_LINE =
  "Your lender collects those securely in their own application. Realora never asks for them.";

const CONTACT_LEGAL =
  "Your information will be processed subject to our Terms of Service and Privacy Notice.";

const WHY: Record<number, string> = {
  1: "If a lender has already approved you, you don't need a packet — upload the letter and your portal number becomes your lender's number.",
  2: "Lenders work to your timeline — and a pre-approval is usually good for 60 to 90 days, so timing decides when to pull the trigger.",
  3: "Property type changes the loan — co-ops and condos carry building reviews and different down-payment rules than a townhouse.",
  4: "Occupancy sets the loan program and the down payment — lenders price a primary home differently from an investment.",
  5: "Location drives taxes, insurance, and which loan limits apply.",
  6: "Price is the anchor every other number hangs from.",
  7: "Your comfort ceiling matters as much as the lender's maximum — a good lender works to both.",
  8: "Cash up front sets your loan size — and what's left in reserve after closing.",
  9: "Lenders verify that your funds are in place and seasoned — timing gaps are easier to solve when they're named early.",
  10: "Income is the top half of the ratio lenders use to size your loan.",
  11: "Debts are the bottom half of the ratio — together with income, they produce your estimate.",
  12: "Self-employment income is documented differently — lenders average it over two years, so they ask early.",
  13: "Recent ownership affects which programs you qualify for — some are reserved for first-time buyers.",
  14: "A VA loan is often the best loan on the table for those who qualify — no lender will guess it for you.",
  15: "Every lender asks this — it's on the standard application. A yes doesn't end the conversation; it changes which programs and timelines apply.",
  16: "Your score band shapes your rate and down payment. This is your estimate — your lender runs the real pull, with your permission, on their side.",
  17: "Your packet goes to a person, not a portal — the lender needs a name and a number to call back.",
  18: "It opens your file with the lender — every application starts with where you live now.",
};

const inputClassModal =
  "mt-2 h-11 w-full rounded-xl border border-line bg-cream px-3.5 text-sm text-forest outline-none focus:border-forest";

const inputClassPage =
  "mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-forest outline-none focus:border-forest";

function loadDraft(): LenderPacketDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = {
      ...EMPTY_LENDER_PACKET_DRAFT,
      ...JSON.parse(raw),
    } as LenderPacketDraft;
    if (draft.phone) draft.phone = formatPhoneInput(draft.phone);
    return draft;
  } catch {
    return null;
  }
}

function persistDraft(draft: LenderPacketDraft) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DRAFT_KEY);
  sessionStorage.removeItem(STEP_KEY);
}

function loadStep(): number {
  if (typeof window === "undefined") return 1;
  const raw = sessionStorage.getItem(STEP_KEY);
  const n = raw ? Number(raw) : 1;
  return Number.isFinite(n) && n >= 1 && n <= TOTAL_STEPS ? n : 1;
}

function persistStep(step: number) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STEP_KEY, String(step));
}

/** Lender chooser is skipped — packet still needs a destination. */
function withDefaultLender(draft: LenderPacketDraft): LenderPacketDraft {
  if (draft.lenderId || (draft.lenderName && draft.lenderEmail)) return draft;
  const first = PANEL_LENDERS[0];
  if (!first) return draft;
  return {
    ...draft,
    byo: false,
    lenderId: first.id,
    lenderName: first.name,
    lenderEmail: first.email,
  };
}

function MoneyInput({
  label,
  value,
  onChange,
  inputClass,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  inputClass: string;
  suffix?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-forest">{label}</span>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={value ? `$ ${formatNumber(value)}` : ""}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            onChange(digits ? Number(digits) : 0);
          }}
          className={inputClass}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}

export function LenderQuestionnaire({
  open,
  onClose,
  onAlreadyPreapproved,
  chrome = "modal",
  onStepChange,
  onGaugeReveal,
  onComplete,
  resumeAfterGauge = 0,
}: {
  open: boolean;
  onClose: () => void;
  onAlreadyPreapproved: () => void;
  chrome?: "modal" | "page";
  onStepChange?: (step: number) => void;
  /** After address step — host shows crunching → gauge. */
  onGaugeReveal?: (amount: number) => void;
  onComplete?: (result: {
    status: LenderPacketBuyerStatus;
    lenderName: string;
  }) => void;
  /** Host increments after gauge Continue → advance to lender step. */
  resumeAfterGauge?: number;
}) {
  const router = useRouter();
  const user = useAppData((s) => s.user);
  const buyingPower = useAppData((s) => s.buyingPower);
  const saveBuyingPower = useAppData((s) => s.saveBuyingPower);
  const page = chrome === "page";
  const inputClass = page ? inputClassPage : inputClassModal;

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<LenderPacketDraft>(EMPTY_LENDER_PACKET_DRAFT);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setHydrated(false);
      return;
    }
    const saved = loadDraft();
    if (saved) {
      const restored = Math.min(loadStep(), TOTAL_STEPS);
      setDraft(withDefaultLender(saved));
      setStep(restored);
      onStepChange?.(restored);
      setConsent(false);
      setError(null);
      setWhyOpen(false);
      setHydrated(true);
      return;
    }
    const next = { ...EMPTY_LENDER_PACKET_DRAFT };
    if (buyingPower) {
      next.downPayment = buyingPower.downPayment;
      next.annualIncome = buyingPower.annualIncome;
      next.monthlyDebts = buyingPower.monthlyDebts;
      next.targetPrice = computeBuyingPower(buyingPower).maxHomePrice;
    }
    if (user.signedIn && user.name) {
      const parts = user.name.trim().split(/\s+/);
      if (parts[0]) next.legalFirstName = parts[0];
      if (parts.length > 1) next.legalLastName = parts.slice(1).join(" ");
    }
    setDraft(withDefaultLender(next));
    setStep(1);
    persistStep(1);
    onStepChange?.(1);
    setConsent(false);
    setError(null);
    setWhyOpen(false);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onStepChange]);

  useEffect(() => {
    if (!open || !hydrated) return;
    persistDraft(draft);
  }, [draft, open, hydrated]);

  function goToStep(n: number) {
    const next = Math.min(TOTAL_STEPS, Math.max(1, n));
    setStep(next);
    persistStep(next);
    onStepChange?.(next);
    setWhyOpen(false);
    setError(null);
  }

  useEffect(() => {
    if (!open || !hydrated) return;
    onStepChange?.(step);
  }, [step, open, onStepChange, hydrated]);

  useEffect(() => {
    if (!resumeAfterGauge || !open || !hydrated) return;
    setDraft((prev) => withDefaultLender(prev));
    goToStep(MORTGAGE_REVIEW_STEP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeAfterGauge, open, hydrated]);

  const estimate = useMemo(() => {
    if (!(draft.annualIncome > 0)) return null;
    return computeBuyingPower({
      annualIncome: draft.annualIncome,
      monthlyDebts: draft.monthlyDebts,
      downPayment: draft.downPayment || BUYING_POWER_DEFAULTS.downPayment,
      creditBand: buyingPower?.creditBand ?? BUYING_POWER_DEFAULTS.creditBand,
      annualRatePct: buyingPower?.annualRatePct ?? BUYING_POWER_DEFAULTS.annualRatePct,
      termYears: buyingPower?.termYears ?? BUYING_POWER_DEFAULTS.termYears,
    });
  }, [draft, buyingPower]);

  function patch<K extends keyof LenderPacketDraft>(key: K, value: LenderPacketDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  async function saveBuyingPowerProfile() {
    await Promise.resolve(
      saveBuyingPower({
        annualIncome: draft.annualIncome,
        monthlyDebts: draft.monthlyDebts,
        downPayment: draft.downPayment || BUYING_POWER_DEFAULTS.downPayment,
        creditBand: buyingPower?.creditBand ?? BUYING_POWER_DEFAULTS.creditBand,
        annualRatePct: buyingPower?.annualRatePct ?? BUYING_POWER_DEFAULTS.annualRatePct,
        termYears: buyingPower?.termYears ?? BUYING_POWER_DEFAULTS.termYears,
      }),
    );
  }

  function validateStep(n: number): string | null {
    switch (n) {
      case 1:
        return draft.alreadyPreapproved === null
          ? "Tell us whether you already have a pre-approval letter."
          : null;
      case 2:
        return draft.timeline ? null : "Choose a timeline.";
      case 3:
        return draft.propertyType ? null : "Choose a property type.";
      case 4:
        return draft.occupancy ? null : "Choose how you will use the home.";
      case 5:
        return draft.area.trim() ? null : "Enter a city or ZIP code.";
      case 6:
        return draft.targetPrice > 0 ? null : "Enter a home price.";
      case 7:
        return draft.comfortMonthlyPayment > 0
          ? null
          : "Enter a comfortable monthly payment.";
      case 8:
        return draft.downPayment >= 0 ? null : "Enter cash available up front.";
      case 9:
        return draft.fundsTiming ? null : "Choose when funds will be ready.";
      case 10:
        return draft.annualIncome > 0 ? null : "Enter annual income.";
      case 11:
        return draft.monthlyDebts >= 0 ? null : "Enter monthly debts.";
      case 12:
        return draft.selfEmployed === null ? "Choose yes or no." : null;
      case 13:
        return draft.ownedHomePast3Years === null ? "Choose yes or no." : null;
      case 14:
        return draft.militaryAffiliation === null ? "Choose yes or no." : null;
      case 15:
        return draft.bankruptcyOrShortSale === null ? "Choose yes or no." : null;
      case 16:
        return draft.creditScoreBand ? null : "Choose a credit-score band.";
      case 17:
        if (!draft.legalFirstName.trim() || !draft.legalLastName.trim()) {
          return "Enter your legal first and last name.";
        }
        if (!draft.phone.trim()) return "Enter a phone number.";
        return null;
      case 18:
        if (!draft.currentStreet.trim() || !draft.currentCity.trim()) {
          return "Enter your street address and city.";
        }
        if (!draft.currentState.trim() || !draft.currentZip.trim()) {
          return "Enter state and ZIP code.";
        }
        return null;
      default:
        return null;
    }
  }

  async function goNext() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    if (step === 1 && draft.alreadyPreapproved === true) {
      clearDraft();
      if (!page) onClose();
      onAlreadyPreapproved();
      return;
    }
    if (step === MORTGAGE_DEBTS_STEP) {
      try {
        await saveBuyingPowerProfile();
      } catch {
        /* store may toast */
      }
    }
    if (step === MORTGAGE_ADDRESS_STEP && page && onGaugeReveal) {
      const amount =
        estimate?.maxHomePrice ??
        computeBuyingPower({
          annualIncome: draft.annualIncome,
          monthlyDebts: draft.monthlyDebts,
          downPayment: draft.downPayment || BUYING_POWER_DEFAULTS.downPayment,
          creditBand: buyingPower?.creditBand ?? BUYING_POWER_DEFAULTS.creditBand,
          annualRatePct: buyingPower?.annualRatePct ?? BUYING_POWER_DEFAULTS.annualRatePct,
          termYears: buyingPower?.termYears ?? BUYING_POWER_DEFAULTS.termYears,
        }).maxHomePrice;
      onGaugeReveal(amount);
      return;
    }
    if (step === MORTGAGE_ADDRESS_STEP && !page) {
      try {
        await saveBuyingPowerProfile();
      } catch {
        /* */
      }
      setDraft((prev) => withDefaultLender(prev));
    }
    goToStep(step + 1);
  }

  async function onSend() {
    const packetDraft = withDefaultLender(draft);
    if (!packetDraft.lenderName || !packetDraft.lenderEmail) {
      setError("No lender is available to receive your packet.");
      return;
    }
    if (!consent) {
      setError("Consent is required before Realora can send your packet.");
      return;
    }
    if (!user.signedIn) {
      persistDraft(packetDraft);
      const next =
        typeof window !== "undefined"
          ? `${window.location.pathname}?lenderPacket=1`
          : "/mortgage?lenderPacket=1";
      router.push(`/auth?intent=buying&next=${encodeURIComponent(next)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveBuyingPowerProfile();
      const result = await sendLenderPacketAction({
        draft: packetDraft,
        consentVersion: LENDER_PACKET_CONSENT_VERSION,
        consented: true,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      clearDraft();
      if (page && onComplete) {
        onComplete({
          status: result.data.buyerStatus,
          lenderName: packetDraft.lenderName,
        });
        return;
      }
      onClose();
      router.push("/portal/buyer/financing");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const body = (
    <>
      {step === 1 ? (
        <StepShell title="Do you already have a pre-approval letter?">
          <Choice
            selected={draft.alreadyPreapproved === true}
            onClick={() => patch("alreadyPreapproved", true)}
            label="Yes"
          />
          <Choice
            selected={draft.alreadyPreapproved === false}
            onClick={() => patch("alreadyPreapproved", false)}
            label="No"
          />
        </StepShell>
      ) : null}

      {step === 2 ? (
        <StepShell title="When are you looking to buy?">
          {LENDER_PACKET_TIMELINES.map((t) => (
            <Choice
              key={t}
              selected={draft.timeline === t}
              onClick={() => patch("timeline", t as LenderPacketTimeline)}
              label={t}
            />
          ))}
        </StepShell>
      ) : null}

      {step === 3 ? (
        <StepShell title="What kind of property do you plan to buy?">
          {LENDER_PACKET_PROPERTY_TYPES.map((t) => (
            <Choice
              key={t}
              selected={draft.propertyType === t}
              onClick={() => patch("propertyType", t as LenderPacketPropertyType)}
              label={t}
            />
          ))}
        </StepShell>
      ) : null}

      {step === 4 ? (
        <StepShell title="How will you use your home?">
          {LENDER_PACKET_OCCUPANCIES.map((t) => (
            <Choice
              key={t}
              selected={draft.occupancy === t}
              onClick={() => patch("occupancy", t as LenderPacketOccupancy)}
              label={t}
            />
          ))}
        </StepShell>
      ) : null}

      {step === 5 ? (
        <StepShell title="What city or ZIP code do you want to buy in?">
          <label className="block text-sm">
            <span className="font-medium text-forest">City or ZIP code</span>
            <input
              className={inputClass}
              value={draft.area}
              onChange={(e) => patch("area", e.target.value)}
              placeholder="Park Slope or 11215"
            />
          </label>
        </StepShell>
      ) : null}

      {step === 6 ? (
        <StepShell title="What home price are you considering?">
          <MoneyInput
            label="Home price"
            value={draft.targetPrice}
            onChange={(n) => patch("targetPrice", n)}
            inputClass={inputClass}
          />
          <p className="text-sm leading-6 text-muted">
            An estimate is fine. If you&apos;re considering a range, enter a number near the
            middle.
          </p>
        </StepShell>
      ) : null}

      {step === 7 ? (
        <StepShell title="What monthly payment are you comfortable with?">
          <MoneyInput
            label="Monthly payment"
            value={draft.comfortMonthlyPayment}
            onChange={(n) => patch("comfortMonthlyPayment", n)}
            inputClass={inputClass}
            suffix="/month"
          />
        </StepShell>
      ) : null}

      {step === 8 ? (
        <StepShell title="How much cash can you put down up front, including closing costs?">
          <MoneyInput
            label="Cash up front"
            value={draft.downPayment}
            onChange={(n) => patch("downPayment", n)}
            inputClass={inputClass}
          />
        </StepShell>
      ) : null}

      {step === 9 ? (
        <StepShell title="When will you have the money to cover down payment and closing costs?">
          {LENDER_PACKET_FUNDS_TIMING.map((t) => (
            <Choice
              key={t}
              selected={draft.fundsTiming === t}
              onClick={() => patch("fundsTiming", t as LenderPacketFundsTiming)}
              label={t}
            />
          ))}
        </StepShell>
      ) : null}

      {step === 10 ? (
        <StepShell title="What's your gross (pre-tax) annual income?">
          <MoneyInput
            label="Annual income"
            value={draft.annualIncome}
            onChange={(n) => patch("annualIncome", n)}
            inputClass={inputClass}
            suffix="/year"
          />
          <p className="text-sm leading-6 text-muted">
            This includes all wages, bonuses, and commissions.
          </p>
        </StepShell>
      ) : null}

      {step === 11 ? (
        <StepShell title="What do you pay each month toward debts?">
          <MoneyInput
            label="Monthly debts"
            value={draft.monthlyDebts}
            onChange={(n) => patch("monthlyDebts", n)}
            inputClass={inputClass}
            suffix="/month"
          />
          <p className="text-sm leading-6 text-muted">
            Car payments, card minimums, student loans — not rent or utilities.
          </p>
        </StepShell>
      ) : null}

      {step === 12 ? (
        <StepShell title="Is any of your income from self-employment?">
          <Choice
            selected={draft.selfEmployed === true}
            onClick={() => patch("selfEmployed", true)}
            label="Yes"
          />
          <Choice
            selected={draft.selfEmployed === false}
            onClick={() => patch("selfEmployed", false)}
            label="No"
          />
          <p className="text-sm leading-6 text-muted">
            This includes freelance, contract, 1099, or gig work, and income from a business you
            own.
          </p>
        </StepShell>
      ) : null}

      {step === 13 ? (
        <StepShell title="Have you owned a home in the past 3 years?">
          <Choice
            selected={draft.ownedHomePast3Years === true}
            onClick={() => patch("ownedHomePast3Years", true)}
            label="Yes"
          />
          <Choice
            selected={draft.ownedHomePast3Years === false}
            onClick={() => patch("ownedHomePast3Years", false)}
            label="No"
          />
        </StepShell>
      ) : null}

      {step === 14 ? (
        <StepShell title="Do you or your spouse have a military affiliation?">
          <Choice
            selected={draft.militaryAffiliation === true}
            onClick={() => patch("militaryAffiliation", true)}
            label="Yes"
          />
          <Choice
            selected={draft.militaryAffiliation === false}
            onClick={() => patch("militaryAffiliation", false)}
            label="No"
          />
          <p className="text-sm leading-6 text-muted">
            If you or your spouse are a veteran or active military, or you&apos;re a surviving
            spouse, you may qualify for a VA loan with $0 down and no private mortgage insurance
            (PMI).
          </p>
        </StepShell>
      ) : null}

      {step === 15 ? (
        <StepShell title="Have you had a bankruptcy, foreclosure, or short sale in the past 7 years?">
          <Choice
            selected={draft.bankruptcyOrShortSale === true}
            onClick={() => patch("bankruptcyOrShortSale", true)}
            label="Yes"
          />
          <Choice
            selected={draft.bankruptcyOrShortSale === false}
            onClick={() => patch("bankruptcyOrShortSale", false)}
            label="No"
          />
        </StepShell>
      ) : null}

      {step === 16 ? (
        <StepShell title="What's your credit score?">
          {LENDER_PACKET_CREDIT_BANDS.map((t) => (
            <Choice
              key={t}
              selected={draft.creditScoreBand === t}
              onClick={() => patch("creditScoreBand", t as LenderPacketCreditBand)}
              label={t}
            />
          ))}
          <p className="text-sm leading-6 text-muted">
            If you&apos;re not sure what your most recent score is, it&apos;s okay to choose the
            most likely range.
          </p>
        </StepShell>
      ) : null}

      {step === 17 ? (
        <StepShell title="Some basic contact information.">
          <label className="block text-sm">
            <span className="font-medium text-forest">Legal first name</span>
            <input
              className={inputClass}
              value={draft.legalFirstName}
              onChange={(e) => patch("legalFirstName", e.target.value)}
              autoComplete="given-name"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-forest">Legal last name</span>
            <input
              className={inputClass}
              value={draft.legalLastName}
              onChange={(e) => patch("legalLastName", e.target.value)}
              autoComplete="family-name"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-forest">Phone number</span>
            <input
              className={inputClass}
              type="tel"
              inputMode="tel"
              placeholder="(555) 123-4567"
              value={draft.phone}
              onChange={(e) => patch("phone", formatPhoneInput(e.target.value))}
              autoComplete="tel"
            />
          </label>
          <p className="text-sm leading-6 text-muted">{CONTACT_LEGAL}</p>
        </StepShell>
      ) : null}

      {step === 18 ? (
        <StepShell title="What's your current address?">
          <label className="block text-sm">
            <span className="font-medium text-forest">Street address</span>
            <input
              className={inputClass}
              value={draft.currentStreet}
              onChange={(e) => patch("currentStreet", e.target.value)}
              autoComplete="address-line1"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-forest">Unit (optional)</span>
            <input
              className={inputClass}
              value={draft.currentUnit}
              onChange={(e) => patch("currentUnit", e.target.value)}
              autoComplete="address-line2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-forest">City</span>
            <input
              className={inputClass}
              value={draft.currentCity}
              onChange={(e) => patch("currentCity", e.target.value)}
              autoComplete="address-level2"
            />
          </label>
          <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
            <label className="block text-sm">
              <span className="font-medium text-forest">State</span>
              <input
                className={inputClass}
                value={draft.currentState}
                onChange={(e) => patch("currentState", e.target.value.toUpperCase())}
                autoComplete="address-level1"
                maxLength={2}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-forest">ZIP code</span>
              <input
                className={inputClass}
                value={draft.currentZip}
                onChange={(e) => patch("currentZip", e.target.value)}
                autoComplete="postal-code"
              />
            </label>
          </div>
        </StepShell>
      ) : null}

      {step === MORTGAGE_REVIEW_STEP ? (
        <StepShell title="Review your packet">
          <dl className="space-y-2 rounded-2xl border border-line bg-white px-4 py-4 text-sm">
            <Row label="Timeline" value={draft.timeline || "—"} />
            <Row label="Where" value={draft.area || "—"} />
            <Row label="Property" value={draft.propertyType || "—"} />
            <Row label="Occupancy" value={draft.occupancy || "—"} />
            <Row label="Target price" value={formatMoney(draft.targetPrice)} />
            <Row
              label="Monthly payment (buyer-stated)"
              value={`${formatMoney(draft.comfortMonthlyPayment)}/mo`}
            />
            <Row label="Cash up front" value={formatMoney(draft.downPayment)} />
            <Row label="Funds timing" value={draft.fundsTiming || "—"} />
            <Row label="Income" value={formatMoney(draft.annualIncome)} />
            <Row label="Monthly debts" value={`${formatMoney(draft.monthlyDebts)}/mo`} />
            <Row
              label="Self-employment"
              value={draft.selfEmployed === null ? "—" : draft.selfEmployed ? "Yes" : "No"}
            />
            <Row
              label="Owned home (3 yrs)"
              value={
                draft.ownedHomePast3Years === null
                  ? "—"
                  : draft.ownedHomePast3Years
                    ? "Yes"
                    : "No"
              }
            />
            <Row
              label="Military affiliation"
              value={
                draft.militaryAffiliation === null
                  ? "—"
                  : draft.militaryAffiliation
                    ? "Yes"
                    : "No"
              }
            />
            <Row
              label="Bankruptcy / foreclosure / short sale"
              value={
                draft.bankruptcyOrShortSale === null
                  ? "—"
                  : draft.bankruptcyOrShortSale
                    ? "Yes"
                    : "No"
              }
            />
            <Row
              label="Credit (self-reported)"
              value={draft.creditScoreBand || "—"}
            />
            <Row
              label="Contact"
              value={`${draft.legalFirstName} ${draft.legalLastName} · ${draft.phone}`}
            />
            <Row
              label="Current address"
              value={`${draft.currentStreet}${draft.currentUnit ? ` ${draft.currentUnit}` : ""}, ${draft.currentCity}, ${draft.currentState} ${draft.currentZip}`}
            />
            <Row label="Lender" value={`${draft.lenderName} · ${draft.lenderEmail}`} />
            {estimate ? (
              <Row label="Estimated buying power" value={formatMoney(estimate.maxHomePrice)} />
            ) : null}
          </dl>
          <p className="mt-4 text-sm leading-6 text-forest/80">{BOUNDARY_LINE}</p>
          <Checkbox
            checked={consent}
            onChange={setConsent}
            className="mt-4 items-start rounded-xl border border-line bg-white px-4 py-3"
            markClassName="mt-0.5"
          >
            <span className="leading-6">
              I direct Realora to send this introduction packet to{" "}
              {draft.lenderName || "my lender"}, and I acknowledge that lender may contact me
              about this inquiry. Realora is not a lender and charges no fee for this
              introduction.
            </span>
          </Checkbox>
        </StepShell>
      ) : null}

      <WhyWeAsk
        open={whyOpen}
        onToggle={() => setWhyOpen((o) => !o)}
        text={WHY[step] ?? ""}
      />

      {error ? <p className="mt-4 text-sm text-[#9b2c2c]">{error}</p> : null}
    </>
  );

  const footer = (
    <div
      className={
        page
          ? "flex justify-between pt-2"
          : "flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-5 py-4 sm:px-6"
      }
    >
      <Button
        type="button"
        variant="ghost"
        className={page ? "px-2.5" : undefined}
        disabled={busy || (!page && step === 1)}
        onClick={() => {
          if (step === 1) {
            onClose();
            return;
          }
          goToStep(step - 1);
        }}
      >
        {page ? <ChevronLeft className="h-4 w-4" /> : null}
        Back
      </Button>
      {step < TOTAL_STEPS ? (
        <Button type="button" variant="lime" onClick={() => void goNext()}>
          Next
        </Button>
      ) : (
        <Button type="button" variant="lime" disabled={busy} onClick={() => void onSend()}>
          {user.signedIn ? "Send packet" : "Sign in to send"}
        </Button>
      )}
    </div>
  );

  if (page) {
    return (
      <div className="space-y-3">
        {body}
        {footer}
      </div>
    );
  }

  const progressPct = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-forest/40 p-0 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lender-q-title"
        className="flex max-h-[100svh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-line bg-cream shadow-xl sm:max-h-[90vh] sm:rounded-3xl"
      >
        <header className="border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted">
                Step {step} of {TOTAL_STEPS}
              </p>
              <h2 id="lender-q-title" className="mt-1 text-lg font-semibold text-forest">
                Find a lender
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-warm"
            >
              Close
            </button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-warm">
            <div
              className="h-full rounded-full bg-forest transition-[width]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{body}</div>
        {footer}
      </div>
    </div>
  );
}

function StepShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-forest">{title}</h3>
      <div className="mt-5 space-y-3">{children}</div>
    </div>
  );
}

function WhyWeAsk({
  open,
  onToggle,
  text,
}: {
  open: boolean;
  onToggle: () => void;
  text: string;
}) {
  if (!text) return null;
  return (
    <div className="mt-5 border-t border-line pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-forest"
      >
        Why we ask
        <ChevronDown className={cn("h-4 w-4 text-muted transition", open && "rotate-180")} />
      </button>
      {open ? <p className="mt-2 text-sm leading-6 text-muted">{text}</p> : null}
    </div>
  );
}

function Choice({
  selected,
  onClick,
  label,
  detail,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  detail?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border px-4 py-3.5 text-left transition",
        selected
          ? "border-forest bg-forest text-cream"
          : "border-line bg-white text-forest hover:bg-warm",
      )}
    >
      <p className="text-sm font-medium">{label}</p>
      {detail ? (
        <p className={cn("mt-0.5 text-xs", selected ? "text-cream/75" : "text-muted")}>
          {detail}
        </p>
      ) : null}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-forest">{value}</dd>
    </div>
  );
}
