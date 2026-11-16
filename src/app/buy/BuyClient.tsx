"use client";

import { Suspense } from "react";
import { MarketplaceView } from "@/components/marketplace/MarketplaceView";

export function BuyClient() {
  return (
    <Suspense fallback={<div className="min-h-[50vh] bg-cream" />}>
      <MarketplaceView />
    </Suspense>
  );
}
