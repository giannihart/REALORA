import { Suspense } from "react";
import { DocumentVault } from "@/components/portal/DocumentVault";
import { PortalShell } from "@/components/portal/PortalSidebar";

export const metadata = { title: "Documents" };

export default function Page() {
  return (
    <PortalShell role="buyer">
      <Suspense fallback={null}>
        <DocumentVault role="buyer" />
      </Suspense>
    </PortalShell>
  );
}
