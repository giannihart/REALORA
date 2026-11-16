"use client";

import { Suspense } from "react";
import { BuyerFinancingBoard } from "@/components/portal/BuyerFinancingBoard";
import { PortalShell } from "@/components/portal/PortalSidebar";

export default function FinancingPage() {
  return (
    <PortalShell role="buyer">
      <Suspense fallback={null}>
        <BuyerFinancingBoard />
      </Suspense>
    </PortalShell>
  );
}
