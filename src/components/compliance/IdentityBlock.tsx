"use client";

import { isLocalDataMode } from "@/lib/data/mode";
import { useAppData } from "@/lib/data/use-app-data";

export function IdentityBlock({ className }: { className?: string }) {
  const brokerage = useAppData((s) => s.brokerage);
  if (isLocalDataMode()) return null;
  if (!brokerage) return null;
  return (
    <p className={className ?? "text-xs text-muted"}>
      {brokerage.legalName}
      {brokerage.licenseNumber ? ` · License ${brokerage.licenseNumber}` : ""}
    </p>
  );
}
