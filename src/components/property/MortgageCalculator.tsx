"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { defaultInsuranceAnnual, estimatePayment } from "@/lib/finance";
import { Checkbox } from "@/components/ui/Checkbox";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { cn, formatPrice } from "@/lib/format";

export function MortgageCalculator({
  price,
  annualTaxes,
  hoaMonthly = 0,
  downPercent,
  variant = "full",
}: {
  price: number;
  annualTaxes?: number;
  hoaMonthly?: number;
  /** Initial down payment percent (deal-aware). */
  downPercent?: number;
  /** `deal` omits HOA / utilities expanders for the Financing page utility. */
  variant?: "full" | "deal";
}) {
  const dealVariant = variant === "deal";
  const [homePrice, setHomePrice] = useState(price);
  const [downPct, setDownPct] = useState(downPercent ?? 20);
  const [rate, setRate] = useState(6.5);
  const [term, setTerm] = useState(30);
  const [closingCosts, setClosingCosts] = useState(Math.round(price * 0.04));
  const [includePmi, setIncludePmi] = useState(true);
  const [taxRatePct, setTaxRatePct] = useState(
    annualTaxes != null && price > 0
      ? roundTaxRate((annualTaxes / price) * 100)
      : 1.1,
  );
  const [insuranceAnnual, setInsuranceAnnual] = useState(
    defaultInsuranceAnnual(price),
  );
  const [hoa, setHoa] = useState(dealVariant ? 0 : hoaMonthly);
  const [includeUtilities, setIncludeUtilities] = useState(false);
  const [water, setWater] = useState(0);
  const [gas, setGas] = useState(0);
  const [internet, setInternet] = useState(0);
  const [electric, setElectric] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setHomePrice(price);
    setClosingCosts(Math.round(price * 0.04));
    setInsuranceAnnual(defaultInsuranceAnnual(price));
    if (annualTaxes != null && price > 0) {
      setTaxRatePct(roundTaxRate((annualTaxes / price) * 100));
    }
  }, [price, annualTaxes]);

  useEffect(() => {
    if (downPercent != null) setDownPct(clamp(downPercent, 0, 100));
  }, [downPercent]);

  useEffect(() => {
    setHoa(dealVariant ? 0 : hoaMonthly);
  }, [hoaMonthly, dealVariant]);

  const downPayment = clamp(homePrice * (downPct / 100), 0, homePrice);
  const utilitiesMonthly = includeUtilities
    ? water + gas + internet + electric
    : 0;
  const est = useMemo(
    () =>
      estimatePayment({
        price: homePrice,
        downPaymentPct: homePrice > 0 ? (downPayment / homePrice) * 100 : 0,
        annualRatePct: rate,
        termYears: term,
        taxRatePct,
        insuranceAnnual,
        hoaMonthly: hoa,
        includePmi,
        utilitiesMonthly,
      }),
    [
      homePrice,
      downPayment,
      rate,
      term,
      taxRatePct,
      insuranceAnnual,
      hoa,
      includePmi,
      utilitiesMonthly,
    ],
  );

  function toggle(id: string) {
    setOpen((current) => ({ ...current, [id]: !current[id] }));
  }

  function setDownFromDollars(amount: number) {
    if (homePrice <= 0) return;
    setDownPct(clamp(roundTaxRate((amount / homePrice) * 100), 0, 100));
  }

  function setHomePriceAndKeepDown(next: number) {
    const safe = Math.max(0, next);
    setHomePrice(safe);
    setClosingCosts(Math.round(safe * 0.04));
  }

  const taxYear = Math.round(homePrice * (taxRatePct / 100));

  return (
    <div className="rounded-3xl border border-line bg-white p-5">
      <p className="text-center text-sm text-muted">Estimated monthly payment</p>
      <p className="mt-1 text-center text-3xl font-semibold tracking-tight text-forest">
        {formatPrice(Math.round(est.total))}
      </p>
      <p className="mt-2 text-center text-xs leading-5 text-muted">
        Illustrative calculation only. Not a loan offer, pre-approval, or quote.
      </p>

      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        <BreakdownRow
          id="pi"
          label="Principal & interest"
          value={formatPrice(Math.round(est.principalAndInterest))}
          open={!!open.pi}
          onToggle={toggle}
        >
          <Field label="Home price">
            <MoneyBox
              value={homePrice}
              prefix="$"
              onChange={setHomePriceAndKeepDown}
            />
          </Field>
          <Field label="Down payment" className="mt-3">
            <div className="flex overflow-hidden rounded-xl border border-line bg-warm/70 focus-within:border-forest">
              <MoneyBox
                value={downPayment}
                prefix="$"
                bare
                onChange={setDownFromDollars}
              />
              <span className="w-px shrink-0 bg-line" />
              <MoneyBox
                value={downPct}
                suffix="%"
                bare
                decimals={2}
                onChange={(n) => setDownPct(clamp(n, 0, 100))}
              />
            </div>
          </Field>
          <Field label="Est. closing costs" className="mt-3">
            <MoneyBox
              value={closingCosts}
              prefix="$"
              onChange={setClosingCosts}
            />
          </Field>
          <p className="mt-1.5 text-xs leading-5 text-muted">
            Typical cash due at closing, about 4% of price. Not part of the
            monthly payment.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <MenuSelect
              label="Loan program"
              value={String(term)}
              options={[
                { value: "30", label: "30-year fixed" },
                { value: "15", label: "15-year fixed" },
              ]}
              onChange={(v) => setTerm(Number(v))}
            />
            <Field label="Interest rate">
              <MoneyBox
                value={rate}
                suffix="%"
                decimals={3}
                onChange={(n) => setRate(clamp(n, 0, 20))}
              />
            </Field>
          </div>
          <Link
            href="/mortgage"
            className="mt-2 inline-block text-sm font-medium text-forest underline decoration-forest/30 underline-offset-4 hover:decoration-forest"
          >
            See current rates
          </Link>
        </BreakdownRow>

        <BreakdownRow
          id="pmi"
          label="Mortgage insurance"
          value={formatPrice(Math.round(est.mortgageInsurance))}
          open={!!open.pmi}
          onToggle={toggle}
        >
          <Checkbox checked={includePmi} onChange={setIncludePmi}>
            Include mortgage insurance
          </Checkbox>
          <p className="mt-2 text-xs leading-5 text-muted">
            Mortgage insurance is usually required for down payments below 20%.
          </p>
        </BreakdownRow>

        <BreakdownRow
          id="tax"
          label="Property taxes"
          value={formatPrice(Math.round(est.taxes))}
          open={!!open.tax}
          onToggle={toggle}
        >
          <p className="text-xs leading-5 text-muted">
            Estimated from home value and the tax figure in this listing file,
            which may not be current. Verify with local taxing authorities.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <p className="mb-1.5 text-sm font-medium text-forest">Home price</p>
              <p className="pb-3 text-sm tabular-nums text-forest">
                {formatPrice(Math.round(homePrice))} ×
              </p>
            </div>
            <Field label="Tax rate" className="min-w-[9rem] flex-1">
              <MoneyBox
                value={taxRatePct}
                suffix="%"
                decimals={2}
                onChange={(n) => setTaxRatePct(clamp(n, 0, 10))}
              />
            </Field>
            <p className="pb-3 text-sm text-forest">
              = {formatPrice(taxYear)} /year
            </p>
          </div>
        </BreakdownRow>

        <BreakdownRow
          id="ins"
          label="Home insurance"
          value={formatPrice(Math.round(est.insurance))}
          open={!!open.ins}
          onToggle={toggle}
        >
          <Field>
            <MoneyBox
              value={insuranceAnnual}
              prefix="$"
              suffix="/year"
              onChange={(n) => setInsuranceAnnual(Math.max(0, n))}
            />
          </Field>
          <p className="mt-2 text-xs leading-5 text-muted">
            Most lenders require homeowners insurance, which protects your home
            and property.
          </p>
        </BreakdownRow>

        {dealVariant ? null : (
          <>
            <BreakdownRow
              id="hoa"
              label="HOA fees"
              value={est.hoa > 0 ? formatPrice(Math.round(est.hoa)) : "None"}
              open={!!open.hoa}
              onToggle={toggle}
            >
              <Field>
                <MoneyBox
                  value={hoa}
                  prefix="$"
                  suffix="/mo"
                  onChange={(n) => setHoa(Math.max(0, n))}
                />
              </Field>
              <p className="mt-2 text-xs leading-5 text-muted">
                Some properties require monthly HOA dues to cover common amenities
                or services.
              </p>
            </BreakdownRow>

            <BreakdownRow
              id="util"
              label="Utilities"
              value={
                includeUtilities
                  ? formatPrice(Math.round(utilitiesMonthly))
                  : "Not included"
              }
              open={!!open.util}
              onToggle={toggle}
            >
              <Checkbox checked={includeUtilities} onChange={setIncludeUtilities}>
                Include utilities in payment
              </Checkbox>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Water/Sewer">
                  <MoneyBox
                    value={water}
                    prefix="$"
                    suffix="/mo"
                    onChange={(n) => setWater(Math.max(0, n))}
                  />
                </Field>
                <Field label="Gas">
                  <MoneyBox
                    value={gas}
                    prefix="$"
                    suffix="/mo"
                    onChange={(n) => setGas(Math.max(0, n))}
                  />
                </Field>
                <Field label="Internet">
                  <MoneyBox
                    value={internet}
                    prefix="$"
                    suffix="/mo"
                    onChange={(n) => setInternet(Math.max(0, n))}
                  />
                </Field>
                <Field label="Electric">
                  <MoneyBox
                    value={electric}
                    prefix="$"
                    suffix="/mo"
                    onChange={(n) => setElectric(Math.max(0, n))}
                  />
                </Field>
              </div>
            </BreakdownRow>
          </>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({
  id,
  label,
  value,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  value: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 bg-white px-4 py-3.5 text-left text-sm text-forest"
      >
        <span className="flex-1">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? <div className="space-y-1 px-4 pb-4">{children}</div> : null}
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      {label ? (
        <span className="mb-1.5 block text-sm font-medium text-forest">
          {label}
        </span>
      ) : null}
      {children}
    </label>
  );
}

function MoneyBox({
  value,
  onChange,
  prefix,
  suffix,
  bare = false,
  decimals = 0,
}: {
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  bare?: boolean;
  decimals?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(formatRaw(value, decimals));

  useEffect(() => {
    if (!focused) setRaw(formatRaw(value, decimals));
  }, [value, decimals, focused]);

  return (
    <span
      className={cn(
        "flex h-11 min-w-0 flex-1 items-center px-3 text-sm text-forest",
        !bare &&
          "rounded-xl border border-line bg-warm/70 focus-within:border-forest",
      )}
    >
      {prefix ? <span className="mr-1.5 shrink-0 text-muted">{prefix}</span> : null}
      <input
        type="text"
        inputMode="decimal"
        value={
          focused
            ? raw
            : value.toLocaleString("en-US", {
                minimumFractionDigits: decimals > 0 && value % 1 !== 0 ? Math.min(decimals, 2) : 0,
                maximumFractionDigits: decimals,
              })
        }
        onFocus={() => {
          setFocused(true);
          setRaw(formatRaw(value, decimals));
        }}
        onBlur={() => {
          setFocused(false);
          onChange(parseAmount(raw));
        }}
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9.]/g, "");
          setRaw(next);
          const n = parseAmount(next);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="min-w-0 flex-1 bg-transparent tabular-nums outline-none"
      />
      {suffix ? <span className="ml-1.5 shrink-0 text-muted">{suffix}</span> : null}
    </span>
  );
}

function parseAmount(raw: string) {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatRaw(value: number, decimals: number) {
  return decimals > 0 ? String(Number(value.toFixed(decimals))) : String(Math.round(value));
}

function roundTaxRate(n: number) {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
