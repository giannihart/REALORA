"use client";

import { PortalShell } from "@/components/portal/PortalSidebar";
import type { ReactNode } from "react";

export function BrokerFrame({ children }: { children: ReactNode }) {
  return <PortalShell role="seller" chrome="broker">{children}</PortalShell>;
}
