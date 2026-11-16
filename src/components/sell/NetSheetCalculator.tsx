"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { RangeSlider } from "@/components/ui/RangeSlider";
import { cn, formatNumber, formatPrice } from "@/lib/format";

export function NetSheetCalculator({
  initialPrice = 4_190_000,
  price: priceProp,
  onPriceChange,
  address = "",
  showPlanCta = false,
  showAskingPrice = true,
  showPlusOne = true,
  showKeepLine = true,
  compact = false,
  className,
}: {
  initialPrice?: number;
  price?: number;
  onPriceChange?: (price: number) => void;
  address?: string;
  showPlanCta?: boolean;
  showAskingPrice?: boolean;
  showPlusOne?: boolean;
  showKeepLine?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [internalPrice, setInternalPrice] = useState(initialPrice);
  const [plusOne, setPlusOne] = useState(false);
  const price = priceProp ?? internalPrice;
  const setPrice = (next: number) => {
    if (priceProp === undefined) setInternalPrice(next);
    onPriceChange?.(next);
  };

  const traditional = price * 0.055;
  const realora = price * (plusOne ? 0.02 : 0.01);
  const keep = traditional - realora;

  const comparison = useMemo(
    () => [
      { label: "Traditional ~5.5%", value: traditional },
      { label: plusOne ? "REALORA 2% total" : "REALORA 1%", value: realora },
    ],
    [traditional, realora, plusOne],
  );

  const boxPad = compact ? "p-4" : "p-6";

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className={cn("space-y-3 rounded-3xl border border-line bg-white", boxPad)}>
        <label className="block">
          <span className="mb-3 block text-sm">
            Estimated sale price {formatPrice(price)}
          </span>
          <RangeSlider
            min={1_000_000}
            max={10_000_000}
            step={10_000}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full"
          />
        </label>
        {showAskingPrice ? (
          <label className="block text-sm">
            Asking price
            <input
              type="text"
              inputMode="numeric"
              value={price ? `$${formatNumber(price)}` : ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setPrice(digits ? Number(digits) : 0);
              }}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2"
              aria-label="Estimated price"
            />
          </label>
        ) : null}
        {showPlusOne ? (
          <Checkbox
            checked={plusOne}
            onChange={setPlusOne}
            className="items-start gap-3"
            markClassName="mt-1"
          >
            <span>
              Offer +1% to a buyer&apos;s agent to increase offer volume.
              <span className="block text-muted">
                REALORA still collects 1%. The extra point is optional and goes to
                the agent who brings the buyer.
              </span>
            </span>
          </Checkbox>
        ) : null}
      </div>

      <div className={cn("grid gap-3 md:grid-cols-2", compact ? "mt-3" : "mt-4")}>
        {comparison.map((row) => (
          <div
            key={row.label}
            className={cn("rounded-3xl border border-line bg-white", boxPad)}
          >
            <p className="text-sm text-muted">{row.label}</p>
            <p
              className={cn(
                "font-semibold tracking-tight",
                compact ? "mt-1.5 text-xl" : "mt-2 text-2xl",
              )}
            >
              {formatPrice(Math.round(row.value))}
            </p>
          </div>
        ))}
      </div>
      {showKeepLine ? (
        <p
          className={cn(
            "flex flex-wrap items-baseline gap-x-2 font-medium tracking-tight",
            compact ? "mt-4 text-lg" : "mt-10 text-xl",
          )}
        >
          <span>You keep</span>
          <span
            className={cn(
              "rounded-xl bg-lime px-4 py-1.5 leading-none",
              compact ? "text-4xl" : "text-5xl",
            )}
          >
            {formatPrice(Math.round(keep))}
          </span>
          <span>more with Realora</span>
        </p>
      ) : null}

      {showPlanCta ? (
        <Button
          className="mt-8"
          onClick={() => {
            const q = new URLSearchParams();
            if (address) q.set("address", address);
            q.set("price", String(price));
            q.set("plusOne", plusOne ? "1" : "0");
            router.push(`/sell?${q.toString()}`);
          }}
        >
          Sell with Realora
        </Button>
      ) : null}
    </div>
  );
}
