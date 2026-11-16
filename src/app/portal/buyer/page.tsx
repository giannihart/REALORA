import { PortalHome } from "@/components/portal/HomePanels";
import { PortalShell } from "@/components/portal/PortalSidebar";

export const metadata = { title: "Home" };

export default function BuyerHomePage() {
  return (
    <PortalShell role="buyer">
      <PortalHome role="buyer" />
    </PortalShell>
  );
}
