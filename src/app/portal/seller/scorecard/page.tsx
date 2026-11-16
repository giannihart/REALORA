import { PortalShell } from "@/components/portal/PortalSidebar";
import { ScorecardView } from "@/components/portal/ScorecardView";

export default function SellerScorecardPage() {
  return (
    <PortalShell role="seller">
      <ScorecardView />
    </PortalShell>
  );
}
