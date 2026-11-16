import { BrokerFrame } from "@/app/portal/broker/BrokerFrame";
import { PortalProfileView } from "@/components/portal/PortalProfileView";

export const metadata = { title: "Profile" };

export default function Page() {
  return (
    <BrokerFrame>
      <PortalProfileView role="broker" />
    </BrokerFrame>
  );
}
