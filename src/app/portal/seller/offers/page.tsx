import { OffersBoard } from "@/components/portal/OfferCards";
import { PortalShell } from "@/components/portal/PortalSidebar";

export const metadata = { title: "Offers" };

export default function Page() {
  return (
    <PortalShell role="seller">
      <OffersBoard />
    </PortalShell>
  );
}
