import { SellerPortalGate } from "@/components/portal/SellerPortalGate";

export default function SellerPortalLayout({ children }: { children: React.ReactNode }) {
  return <SellerPortalGate>{children}</SellerPortalGate>;
}
