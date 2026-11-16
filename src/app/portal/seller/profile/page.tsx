import { PortalShell } from "@/components/portal/PortalSidebar";
import { PortalProfileView } from "@/components/portal/PortalProfileView";

export const metadata = { title: "Profile" };

export default function Page() {
  return (
    <PortalShell role="seller">
      <PortalProfileView role="seller" />
    </PortalShell>
  );
}
