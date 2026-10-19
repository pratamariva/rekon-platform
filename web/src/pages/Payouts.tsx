import { useMemo, useState } from "react";
import { trpc } from "../trpc.js";
import { Money } from "../components/Money.js";
import { Drawer } from "../components/Drawer.js";
import { ProofUpload } from "../components/ProofUpload.js";
import { Lightbox } from "../components/Lightbox.js";
import { minorToMajorInput, parseMajorToMinor, convertMinor } from "../lib/money.js";
import type { CurrencyCode } from "../types.js";

export function Payouts() {
  const [tab, setTab] = useState<"due" | "paid">("due");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Payouts</h1>
      <div className="flex gap-1 text-sm">
        <button
          className={`rounded px-3 py-1 ${tab === "due" ? "bg-surface-2 font-medium" : "text-text-muted"}`}
          onClick={() => setTab("due")}
        >
          Due
        </button>
        <button
          className={`rounded px-3 py-1 ${tab === "paid" ? "bg-surface-2 font-medium" : "text-text-muted"}`}
          onClick={() => setTab("paid")}
        >
          Paid
        </button>
      </div>
      {tab === "due" ? <DueTab /> : <PaidTab />}
    </div>
  );
}

function useRatePerUnit() {
  const rates = trpc.settings.listRates.useQuery();
  return useMemo(() => {
    return (functional: CurrencyCode, payee: CurrencyCode): number => {
      if (functional === payee) return 1;
      const ref = rates.data?.find((r) => r.base === payee && r.quote === functional);
      if (!ref) return 0;
      return 1 / Number(ref.rate);
    };
  }, [rates.data]);
}

function DueTab() {
  const queue = trpc.payouts.queue.useQuery();
  const utils = trpc.useUtils();
  const ratePerUnit = useRatePerUnit();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [proofFor, setProofFor] = useState<{ payeeId: string; payoutId: string }[] | null>(null);

  const runBulk = trpc.payouts.runBulk.useMutation({
    onSuccess: (res) => {
      setProofFor(res.results);
      void utils.payouts.queue.invalidate();
      void utils.payouts.history.invalidate();
    },
  });

  const rows = queue.data ?? [];
  const amountFor = (payeeId: string, remaining: bigint, currency: CurrencyCode): string =>
    amounts[payeeId] ?? minorToMajorInput(remaining, currency);

  const run = () => {
    const payouts = rows
      .filter((r) => selected[r.payeeId])
      .map((r) => {
        const raw = amountFor(r.payeeId, r.remainingFunctionalMinor, r.functionalCurrency);
        let minor = parseMajorToMinor(raw, r.functionalCurrency) ?? r.remainingFunctionalMinor;
        if (minor > r.remainingFunctionalMinor) minor = r.remainingFunctionalMinor;
        return { payeeId: r.payeeId, amountMinor: minor };
      })
      .filter((p) => p.amountMinor > 0n);
    if (payouts.length > 0) runBulk.mutate({ payouts });
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected[r.payeeId]);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-text-muted">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={(e) => {
                    const v = e.target.checked;
                    const next: Record<string, boolean> = {};
                    rows.forEach((r) => (next[r.payeeId] = v));
                    setSelected(next);
                  }}
                />
              </th>
              <th className="px-3 py-2">Payee</th>
              <th className="px-3 py-2 text-right">Previously paid</th>
              <th className="px-3 py-2 text-right">Remaining</th>
              <th className="px-3 py-2 text-right">Payout amount</th>
              <th className="px-3 py-2 text-right">In payee currency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const amtStr = amountFor(r.payeeId, r.remainingFunctionalMinor, r.functionalCurrency);
              const amtMinor = parseMajorToMinor(amtStr, r.functionalCurrency) ?? 0n;
              const rate = ratePerUnit(r.functionalCurrency, r.displayCurrency);
              const converted = rate > 0 ? convertMinor(amtMinor, rate) : 0n;
              return (
                <tr key={r.payeeId} className="border-t border-border">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.name}`}
                      checked={!!selected[r.payeeId]}
                      onChange={(e) =>
                        setSelected((s) => ({ ...s, [r.payeeId]: e.target.checked }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right">
                    <Money minor={r.previouslyPaidFunctionalMinor} currency={r.functionalCurrency} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Money minor={r.remainingFunctionalMinor} currency={r.functionalCurrency} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className="w-28 rounded border border-border bg-bg px-2 py-1 text-right tabular"
                      value={amtStr}
                      onChange={(e) =>
                        setAmounts((a) => ({ ...a, [r.payeeId]: e.target.value }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {rate > 0 ? (
                      <Money minor={converted} currency={r.displayCurrency} />
                    ) : (
                      <span className="text-xs text-disputed">no rate</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-subtle">
                  Nothing due.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        disabled={runBulk.isPending}
        className="rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast disabled:opacity-50"
        onClick={run}
      >
        {runBulk.isPending ? "Running…" : "Run selected payouts"}
      </button>

      {proofFor && (
        <PayoutProofDrawer payouts={proofFor} onClose={() => setProofFor(null)} />
      )}
    </div>
  );
}

function PayoutProofDrawer({
  payouts,
  onClose,
}: {
  payouts: { payeeId: string; payoutId: string }[];
  onClose: () => void;
}) {
  const attach = trpc.payouts.attachProof.useMutation();
  return (
    <Drawer title="Attach payment proofs" onClose={onClose}>
      <p className="mb-3 text-sm text-text-muted">
        Payouts were recorded. Attach a bank/PayNow receipt for each.
      </p>
      {payouts.map((p) => (
        <div key={p.payoutId} className="mb-4 rounded border border-border p-3">
          <p className="mb-2 text-sm font-medium">Payout {p.payoutId.slice(0, 8)}…</p>
          <ProofUpload
            onReady={(proof) =>
              attach.mutate({ payoutId: p.payoutId, proofUrl: proof.dataUrl })
            }
          />
        </div>
      ))}
      <button className="rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast" onClick={onClose}>
        Done
      </button>
    </Drawer>
  );
}

function PaidTab() {
  const history = trpc.payouts.history.useQuery();
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-left text-text-muted">
          <tr>
            <th className="px-3 py-2">Payee</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2">Rail</th>
            <th className="px-3 py-2">Paid</th>
            <th className="px-3 py-2">Receipt</th>
          </tr>
        </thead>
        <tbody>
          {history.data?.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="px-3 py-2">{p.payee.name}</td>
              <td className="px-3 py-2 text-right">
                <Money minor={p.payoutAmountMinor} currency={p.payoutCurrency} />
              </td>
              <td className="px-3 py-2">{p.rail}</td>
              <td className="px-3 py-2">{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}</td>
              <td className="px-3 py-2">
                {p.proofUrl ? (
                  <button
                    className="text-brand underline"
                    onClick={() => setPreview({ url: p.proofUrl!, name: `receipt-${p.id}` })}
                  >
                    View
                  </button>
                ) : (
                  <span className="text-text-subtle">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview && (
        <Lightbox
          url={preview.url}
          name={preview.name}
          kind={preview.url.startsWith("data:application/pdf") || preview.url.endsWith(".pdf") ? "pdf" : "image"}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
