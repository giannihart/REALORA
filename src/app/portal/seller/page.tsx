import { PortalHome } from "@/components/portal/HomePanels";
import { PortalShell } from "@/components/portal/PortalSidebar";

export const metadata = { title: "Home" };

export default function Page() {
  return (
    <PortalShell role="seller">
      <PortalHome role="seller" />
    </PortalShell>
  );
}
