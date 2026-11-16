import { PortalShell } from "@/components/portal/PortalSidebar";
import { ServicesGrid } from "@/components/portal/ServicesGrid";

export const metadata = { title: "Services" };

export default function Page() {
  return (
    <PortalShell role="seller">
      <ServicesGrid role="seller" />
    </PortalShell>
  );
}
