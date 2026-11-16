import { notFound } from "next/navigation";
import { isStaff, requireActor } from "@/lib/actions/actor";
import { isLocalDataMode } from "@/lib/data/mode";
import { BrokerFrame } from "./BrokerFrame";

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  if (isLocalDataMode()) notFound();
  try {
    const actor = await requireActor();
    if (!isStaff(actor)) notFound();
  } catch {
    notFound();
  }
  return <BrokerFrame>{children}</BrokerFrame>;
}
