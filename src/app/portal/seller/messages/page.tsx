import { MessagesPane } from "@/components/portal/MessagesPane";
import { PortalShell } from "@/components/portal/PortalSidebar";

export const metadata = { title: "Messages" };

export default function Page() {
  return (
    <PortalShell role="seller">
      <MessagesPane role="seller" />
    </PortalShell>
  );
}
