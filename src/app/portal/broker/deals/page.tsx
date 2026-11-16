import Link from "next/link";
import { listBrokerDealsAction } from "@/lib/actions/broker";

export default async function BrokerDealsPage() {
  const result = await listBrokerDealsAction();
  if (!result.ok) return <p className="text-sm text-muted">{result.message}</p>;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">Deals</h1>
      </div>
      <ul className="space-y-2">
        {result.data.map((deal) => (
          <li key={deal.id} className="rounded-2xl border border-line bg-white px-4 py-3 text-sm">
            <Link href={`/portal/broker/deals/${deal.id}`} className="font-medium underline">
              {deal.address}
            </Link>
            <span className="ml-2 text-muted">
              {deal.state.replaceAll("_", " ")}
              {deal.paused ? " · paused" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
