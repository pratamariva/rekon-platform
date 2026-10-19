import { trpc } from "../trpc.js";
import { Money } from "../components/Money.js";

export function MyEarnings() {
  const earnings = trpc.payeePortal.myEarnings.useQuery();
  if (!earnings.data) return <p className="text-text-muted">Loading…</p>;
  const d = earnings.data;
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-surface p-6">
        <p className="text-sm text-text-muted">Lifetime realized earnings</p>
        <p className="mt-1 text-3xl">
          <Money minor={d.lifetimeFunctionalMinor} currency="IDR" />
        </p>
        <p className="mt-1 text-xs text-text-subtle">
          Realized cash from issued statements — this is not an estimate.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Your contract shares</h2>
        <ul className="space-y-2">
          {d.contractShares.map((c) => (
            <li
              key={c.contractId}
              className="flex items-center justify-between rounded border border-border bg-surface p-3 text-sm"
            >
              <span>
                {c.contractName} <span className="text-text-subtle">({c.role})</span>
              </span>
              <span className="tabular font-medium">{(c.shareBp / 100).toFixed(2)}%</span>
            </li>
          ))}
          {d.contractShares.length === 0 && (
            <li className="text-text-subtle">No contract shares yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
