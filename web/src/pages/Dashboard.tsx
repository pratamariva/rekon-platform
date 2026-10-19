import { Link } from "react-router-dom";
import { trpc } from "../trpc.js";
import { Money } from "../components/Money.js";
import { formatMinor } from "../lib/money.js";

export function Dashboard() {
  const summary = trpc.dashboard.summary.useQuery();
  if (summary.isLoading || !summary.data) {
    return <p className="text-text-muted">Loading dashboard…</p>;
  }
  const d = summary.data;
  const maxTrend = d.revenueTrend.reduce(
    (m, t) => (t.realizedFunctionalMinor > m ? t.realizedFunctionalMinor : m),
    1n,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-text-muted">Total payable</p>
          <p className="mt-1 text-2xl">
            <Money minor={d.totalPayableFunctionalMinor} currency={d.functionalCurrency} />
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-text-muted">Unreconciled lines</p>
          <p
            className={`mt-1 text-2xl tabular ${d.unreconciledCount > 0 ? "text-disputed" : ""}`}
          >
            {d.unreconciledCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-text-muted">Pending payouts</p>
          <p className="mt-1 text-2xl tabular">{d.pendingPayoutsCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-text-muted">Active payees</p>
          <p className="mt-1 text-2xl tabular">{d.activePayeesCount}</p>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-muted">
          Realized revenue, last {d.revenueTrend.length} periods
        </h2>
        <div
          className="flex items-end gap-3"
          role="img"
          aria-label={`Revenue trend: ${d.revenueTrend
            .map((t) => `${t.period} ${formatMinor(t.realizedFunctionalMinor, d.functionalCurrency)}`)
            .join(", ")}`}
        >
          {d.revenueTrend.length === 0 && (
            <p className="text-sm text-text-subtle">No confirmed revenue yet.</p>
          )}
          {d.revenueTrend.map((t) => {
            const pct = Number((t.realizedFunctionalMinor * 100n) / maxTrend);
            return (
              <div key={t.period} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-brand"
                  style={{ height: `${Math.max(4, pct * 1.2)}px` }}
                />
                <span className="text-xs text-text-subtle">{t.period}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-muted">Open exceptions</h2>
        {d.openExceptions.length === 0 ? (
          <p className="text-sm text-text-subtle">Nothing to clean up.</p>
        ) : (
          <ul className="space-y-2">
            {d.openExceptions.map((ex) => (
              <li key={ex.id} className="flex items-center justify-between text-sm">
                <span>{ex.detail}</span>
                {ex.kind === "unmatched_item" && (
                  <Link to="/cleanup" className="text-brand underline">
                    Resolve in Cleanup
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
