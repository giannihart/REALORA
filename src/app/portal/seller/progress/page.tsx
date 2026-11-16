import { ProgressPage } from "@/components/portal/HomePanels";
import { PortalShell } from "@/components/portal/PortalSidebar";

export const metadata = { title: "Progress" };

export default function Page() {
  return (
    <PortalShell role="seller">
      <ProgressPage role="seller" />
    </PortalShell>
  );
}
