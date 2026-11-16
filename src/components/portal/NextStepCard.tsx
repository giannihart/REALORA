"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/shared/Button";
import type { NextStep } from "@/lib/types";

export function NextStepCard({
  step,
  onCta,
}: {
  step: NextStep;
  onCta?: () => void;
}) {
  const ctaClass =
    "ctrl mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-lime px-5 text-sm font-semibold text-forest";

  return (
    <section className="surface-pine rounded-[24px] bg-forest-deep p-[28px] text-cream">
      <p className="text-xs font-medium text-lime">
        Next step
      </p>
      <h2
        className="mt-3 text-[28px] font-semibold tracking-tight"
        style={{ lineHeight: 1.05 }}
      >
        {step.title}
      </h2>
      <p className="mt-3 max-w-[52ch] text-[15px] text-cream/80" style={{ lineHeight: 1.55 }}>
        {step.body}
      </p>
      {step.due ? (
        <p className="mt-2 text-sm text-cream/60">Due {step.due}</p>
      ) : null}
      {onCta ? (
        <Button className={ctaClass} onClick={onCta}>
          {step.cta}
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </Button>
      ) : step.ctaHref ? (
        <Link href={step.ctaHref} className={ctaClass}>
          {step.cta}
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </Link>
      ) : null}
    </section>
  );
}
