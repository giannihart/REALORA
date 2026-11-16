import Link from "next/link";
import { getBrokerOverviewAction } from "@/lib/actions/broker";
import { centsToDollars } from "@/lib/data/map";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(centsToDollars(cents));
}

export default async function BrokerOverviewPage() {
  const result = await getBrokerOverviewAction();
  if (!result.ok) {
    return <p className="text-sm text-muted">{result.message}</p>;
  }
  const data = result.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">Broker overview</h1>
      </div>

      {data.production && data.identity.placeholder ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Brokerage identity is still a placeholder ({data.identity.legalName}, license{" "}
          {data.identity.licenseNumber}). Enter the legal name and license in settings before
          go-live.
        </div>
      ) : (
        <p className="text-sm text-muted">
          {data.identity.legalName} · License {data.identity.licenseNumber}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs text-muted">Pending approvals</p>
          <p className="mt-2 text-3xl font-semibold">{data.pendingApprovals}</p>
          <Link href="/portal/broker/approvals" className="mt-2 inline-block text-sm underline">
            Open queue
          </Link>
        </article>
        <article className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs text-muted">Stalled deals</p>
          <p className="mt-2 text-3xl font-semibold">{data.stalled.length}</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs text-muted">Fee pipeline</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>Projected {money(data.feePipeline.projected)}</li>
            <li>Invoiced {money(data.feePipeline.invoiced)}</li>
            <li>Disbursed {money(data.feePipeline.disbursed)}</li>
          </ul>
        </article>
      </div>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Deals by state</h2>
        <ul className="mt-4 space-y-3">
          {data.byState.map((group) => (
            <li key={group.state}>
              <p className="text-sm font-medium capitalize">
                {group.state.replaceAll("_", " ")} · {group.count}
              </p>
              <ul className="mt-1 space-y-1 text-sm text-forest/80">
                {group.deals.map((deal) => (
                  <li key={deal.id}>
                    <Link href={`/portal/broker/deals/${deal.id}`} className="underline">
                      {deal.address}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {data.stalled.length ? (
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-lg font-semibold">Stalled</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.stalled.map((deal) => (
              <li key={deal.id}>
                <Link href={`/portal/broker/deals/${deal.id}`} className="underline">
                  {deal.address}
                </Link>{" "}
                <span className="text-muted">
                  {deal.state} · last event {deal.lastEventAt ?? "never"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
