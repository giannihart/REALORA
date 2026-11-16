"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { NetSheetCalculator } from "@/components/sell/NetSheetCalculator";

function SavingsInner() {
  const params = useSearchParams();
  const address = params.get("address") ?? "";

  return (
    <div id="main" className="min-h-[calc(100svh-3.5rem)]">
      <div className="mx-auto max-w-xl scroll-mt-20 px-4 py-12">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/savings-calculator.png"
            alt=""
            className="pointer-events-none absolute -top-5 right-0 h-24 w-24 object-contain sm:-top-8 sm:h-32 sm:w-32"
          />
          <div className="pr-[6.75rem] sm:pr-[9.25rem]">
            <h1 className="font-sans text-3xl font-medium tracking-tight">
              Calculate your savings.
            </h1>
            <p className="mt-2 text-sm text-muted">
              Compare Realora&apos;s 1% with a traditional ~5.5% fee.
            </p>
            {address ? (
              <p className="mt-4 text-sm">
                Address on file: <span className="font-medium">{address}</span>
              </p>
            ) : null}
          </div>
          <div className="mt-12">
            <NetSheetCalculator address={address} showPlanCta />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SavingsPage() {
  return (
    <Suspense>
      <SavingsInner />
    </Suspense>
  );
}
