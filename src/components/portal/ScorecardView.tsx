import { getScorecardAction, type Measured } from "@/lib/actions/scorecard";
import { centsToDollars } from "@/lib/data/map";

function shown(metric: Measured<number>, suffix = "") {
  if ("unmeasured" in metric) return "not yet measured";
  if (suffix === "%") return `${metric.value.toFixed(1)}%`;
  return `${metric.value}${suffix}`;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(centsToDollars(cents));
}

export async function ScorecardView() {
  const result = await getScorecardAction();
  if (!result.ok) return <p className="text-sm text-muted">{result.message}</p>;
  const { listings, deals, portfolio } = result.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">Scorecard</h1>
      </div>

      <section className="grid gap-4 sm:grid-cols-4">
        <article className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs text-muted">Closes</p>
          <p className="mt-2 text-2xl font-semibold">{portfolio.closes}</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs text-muted">Gross fees</p>
          <p className="mt-2 text-2xl font-semibold">{money(portfolio.grossFeesCents)}</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs text-muted">Avg days to close</p>
          <p className="mt-2 text-2xl font-semibold">{shown(portfolio.averageDaysToClose)}</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs text-muted">Consent rate</p>
          <p className="mt-2 text-2xl font-semibold">
            {shown(
              "unmeasured" in portfolio.consentRate
                ? portfolio.consentRate
                : { value: portfolio.consentRate.value * 100 },
              "%",
            )}
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Per listing</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-2 pr-4">Address</th>
                <th className="py-2 pr-4">Intake→live</th>
                <th className="py-2 pr-4">Live→close</th>
                <th className="py-2 pr-4">Offers</th>
                <th className="py-2 pr-4">Win vs list</th>
                <th className="py-2 pr-4">Media / campaign</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((row) => (
                <tr key={row.listingId} className="border-t border-line">
                  <td className="py-2 pr-4">{row.address}</td>
                  <td className="py-2 pr-4">{shown(row.daysIntakeToLive, "d")}</td>
                  <td className="py-2 pr-4">{shown(row.daysLiveToClose, "d")}</td>
                  <td className="py-2 pr-4">
                    {row.offerCount} (depth {row.offerDepth})
                  </td>
                  <td className="py-2 pr-4">{shown(row.winningVsListPct, "%")}</td>
                  <td className="py-2 pr-4">
                    {money(row.mediaCostCents)} / {money(row.campaignCostCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Per deal activity</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {deals.map((row) => (
            <li key={row.dealId}>
              {row.address}: {row.activityEvents} events, {row.activityTasks} tasks
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
