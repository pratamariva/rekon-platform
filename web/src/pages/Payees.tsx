import { useState } from "react";
import { trpc } from "../trpc.js";
import { Money } from "../components/Money.js";
import { Drawer } from "../components/Drawer.js";
import type { CurrencyCode } from "../types.js";

export function Payees() {
  const payees = trpc.payees.list.useQuery();
  const [adding, setAdding] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Payees</h1>
        <button
          className="ml-auto rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast"
          onClick={() => setAdding(true)}
        >
          Add payee
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-text-muted">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Currency</th>
              <th className="px-3 py-2">Portal</th>
              <th className="px-3 py-2 text-right">Running payable</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {payees.data?.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-2">
                  {p.name}
                  {p.hasUnrecoupedAdvance && (
                    <span className="ml-2 rounded-full bg-disputed-bg px-2 text-xs text-disputed">
                      Unrecouped advance
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{p.displayCurrency}</td>
                <td className="px-3 py-2">{p.portalStatus}</td>
                <td className="px-3 py-2 text-right">
                  <Money minor={p.runningPayable} currency="IDR" />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    className="rounded border border-border px-2 py-1 text-xs"
                    onClick={() => setDetailId(p.id)}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && <AddPayeeDrawer onClose={() => setAdding(false)} />}
      {detailId && <PayeeDetailDrawer id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function AddPayeeDrawer({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const create = trpc.payees.create.useMutation({
    onSuccess: () => {
      void utils.payees.list.invalidate();
      onClose();
    },
  });
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("IDR");
  const [rail, setRail] = useState<"bank_transfer" | "paynow">("bank_transfer");

  return (
    <Drawer title="Add payee" onClose={onClose}>
      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-text-muted">Name</span>
        <input
          className="w-full rounded border border-border bg-bg px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-text-muted">Display currency</span>
        <select
          className="w-full rounded border border-border bg-surface px-3 py-2"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
        >
          {(["IDR", "USD", "EUR", "SGD", "THB", "MYR"] as CurrencyCode[]).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-4 block text-sm">
        <span className="mb-1 block text-text-muted">Payout rail</span>
        <select
          className="w-full rounded border border-border bg-surface px-3 py-2"
          value={rail}
          onChange={(e) => setRail(e.target.value as typeof rail)}
        >
          <option value="bank_transfer">Bank transfer</option>
          <option value="paynow">PayNow</option>
        </select>
      </label>
      <button
        disabled={!name || create.isPending}
        className="rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast disabled:opacity-50"
        onClick={() => create.mutate({ name, displayCurrency: currency, payoutRail: rail })}
      >
        {create.isPending ? "Creating…" : "Create payee"}
      </button>
    </Drawer>
  );
}

function PayeeDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = trpc.payees.detail.useQuery({ id });
  return (
    <Drawer title="Payee detail" onClose={onClose}>
      {detail.data && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold">{detail.data.name}</h3>
            <p className="text-sm text-text-muted">
              {detail.data.displayCurrency} · {detail.data.payoutRail} · {detail.data.portalStatus}
            </p>
          </div>

          <div>
            <h4 className="mb-1 text-sm font-semibold">Balances by ledger</h4>
            <ul className="space-y-1 text-sm">
              {detail.data.balances.map((b, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span>
                    {b.ledgerName}
                    {b.isUnrecouped && (
                      <span className="ml-2 rounded-full bg-disputed-bg px-2 text-xs text-disputed">
                        Unrecouped
                      </span>
                    )}
                  </span>
                  <Money minor={b.amountMinor} currency={b.currency} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-1 text-sm font-semibold">Recent payouts</h4>
            <ul className="space-y-1 text-sm">
              {detail.data.recentPayouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : p.status}</span>
                  <Money minor={p.payoutAmountMinor} currency={p.payoutCurrency} />
                </li>
              ))}
              {detail.data.recentPayouts.length === 0 && (
                <li className="text-text-subtle">No payouts yet.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </Drawer>
  );
}
