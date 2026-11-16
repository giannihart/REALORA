import { getDealSupervisionAction } from "@/lib/actions/broker";
import { DealFileClient } from "./DealFileClient";

export default async function BrokerDealFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getDealSupervisionAction(id);
  if (!result.ok) return <p className="text-sm text-muted">{result.message}</p>;
  return <DealFileClient file={result.data} />;
}
