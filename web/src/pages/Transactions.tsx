import { useState } from "react";
import { trpc } from "../trpc.js";
import { Money } from "../components/Money.js";
import { Drawer } from "../components/Drawer.js";
import { parseMajorToMinor } from "../lib/money.js";
import type { CurrencyCode } from "../types.js";

const CURRENCIES: CurrencyCode[] = ["IDR", "USD", "EUR", "SGD", "THB", "MYR"];

export function Transactions() {
  const list = trpc.transactions.list.useQuery();
  const utils = trpc.useUtils();
  const [creating, setCreating] = useState(false);
  const [bulk, setBulk] = useState(false);
  const reverse = trpc.transactions.reverse.useMutation({
    onSuccess: () => {
      void utils.transactions.list.invalidate();
      void utils.payees.list.invalidate();
    },
  });

  const onReverse = (id: string) => {
    const reason = window.prompt("Reason for reversal?");
    if (reason) reverse.mutate({ transactionId: id, reason });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <div className="ml-auto flex gap-2">
          <button
            className="rounded border border-border px-3 py-1.5 text-sm"
            onClick={() => setBulk(true)}
          >
            Bulk additionals
          </button>
          <button
            className="rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast"
            onClick={() => setCreating(true)}
          >
            New transaction
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-text-muted">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Memo</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((t) => (
              <tr key={t.id} className={`border-t border-border ${t.voidedAt ? "opacity-50" : ""}`}>
                <td className="px-3 py-2">{t.type}</td>
                <td className="px-3 py-2">{t.memo ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Money minor={t.amountMinor} currency={t.currency} />
                </td>
                <td className="px-3 py-2">{new Date(t.occurredAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right">
                  {t.voidedAt ? (
                    <span className="text-xs text-text-subtle">reversed</span>
                  ) : (
                    <button
                      className="rounded border border-border px-2 py-1 text-xs"
                      onClick={() => onReverse(t.id)}
                    >
                      Reverse
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && <CreateTransactionDrawer onClose={() => setCreating(false)} />}
      {bulk && <BulkAdditionalsDrawer onClose={() => setBulk(false)} />}
    </div>
  );
}

function CreateTransactionDrawer({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const done = () => {
    void utils.transactions.list.invalidate();
    void utils.payees.list.invalidate();
    onClose();
  };
  const incomeExpense = trpc.transactions.createIncomeOrExpense.useMutation({ onSuccess: done });
  const transfer = trpc.transactions.createTransfer.useMutation({ onSuccess: done });
  const payees = trpc.payees.list.useQuery();
  const ledgers = trpc.contracts.listLedgers.useQuery();
  const catalog = trpc.catalog.search.useQuery({ q: "" });

  const [mode, setMode] = useState<"income" | "expense" | "transfer">("income");
  const [currency, setCurrency] = useState<CurrencyCode>("IDR");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [trackId, setTrackId] = useState("");
  const [payeeId, setPayeeId] = useState("");
  const [ledgerId, setLedgerId] = useState("");
  const [direction, setDirection] = useState<"income" | "expense">("income");

  const minor = parseMajorToMinor(amount, currency);
  const valid = minor !== null && minor > 0n && (mode === "transfer" ? !!payeeId : true);

  const submit = () => {
    if (minor === null || minor <= 0n) return;
    if (mode === "transfer") {
      transfer.mutate({
        payeeId,
        ledgerId: ledgerId || null,
        currency,
        amountMinor: minor,
        direction,
        memo: memo || undefined,
      });
    } else {
      incomeExpense.mutate({
        type: mode,
        currency,
        amountMinor: minor,
        memo: memo || undefined,
        trackId: trackId || undefined,
      });
    }
  };

  return (
    <Drawer title="New transaction" onClose={onClose}>
      <div className="mb-4 flex gap-1 text-sm">
        {(["income", "expense", "transfer"] as const).map((m) => (
          <button
            key={m}
            className={`rounded px-2 py-1 capitalize ${mode === m ? "bg-surface-2 font-medium" : "text-text-muted"}`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex gap-2">
          <select
            className="rounded border border-border bg-surface px-2 py-1"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            className="flex-1 rounded border border-border bg-bg px-2 py-1 text-right tabular"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {mode !== "transfer" && (
          <label className="block">
            <span className="mb-1 block text-text-muted">Attribute to track (resolves via contract tree)</span>
            <select
              className="w-full rounded border border-border bg-surface px-2 py-1"
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
            >
              <option value="">Release default (no track)</option>
              {catalog.data?.tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} — {t.release.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === "transfer" && (
          <>
            <label className="block">
              <span className="mb-1 block text-text-muted">Payee</span>
              <select
                className="w-full rounded border border-border bg-surface px-2 py-1"
                value={payeeId}
                onChange={(e) => setPayeeId(e.target.value)}
              >
                <option value="">Select payee…</option>
                {payees.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-text-muted">Ledger</span>
              <select
                className="w-full rounded border border-border bg-surface px-2 py-1"
                value={ledgerId}
                onChange={(e) => setLedgerId(e.target.value)}
              >
                <option value="">Primary</option>
                {ledgers.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-text-muted">Direction</span>
              <select
                className="w-full rounded border border-border bg-surface px-2 py-1"
                value={direction}
                onChange={(e) => setDirection(e.target.value as typeof direction)}
              >
                <option value="income">Income (credit)</option>
                <option value="expense">Expense (debit)</option>
              </select>
            </label>
          </>
        )}

        <input
          className="w-full rounded border border-border bg-bg px-2 py-1"
          placeholder="Memo (optional)"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />

        <button
          disabled={!valid || incomeExpense.isPending || transfer.isPending}
          className="rounded bg-brand px-3 py-1.5 text-brand-contrast disabled:opacity-50"
          onClick={submit}
        >
          Create
        </button>
      </div>
    </Drawer>
  );
}

function BulkAdditionalsDrawer({ onClose }: { onClose: () => void }) {
  const [csv, setCsv] = useState("");
  const utils = trpc.useUtils();
  const preview = trpc.transactions.bulkPreview.useQuery({ csv }, { enabled: csv.length > 0 });
  const commit = trpc.transactions.bulkCommit.useMutation({
    onSuccess: () => {
      void utils.transactions.list.invalidate();
      void utils.payees.list.invalidate();
    },
  });

  return (
    <Drawer title="Bulk additionals" onClose={onClose}>
      <p className="mb-2 text-sm text-text-muted">
        Columns: type, currency, amount, memo, releaseId, trackId, itemId, payeeId, ledgerId,
        direction.
      </p>
      <textarea
        className="h-40 w-full rounded border border-border bg-bg px-2 py-1 font-mono text-xs"
        placeholder="Paste CSV…"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />
      {preview.data && (
        <p className="mt-2 text-sm text-text-muted">
          {preview.data.lines.length} valid · {preview.data.rejected.length} rejected
        </p>
      )}
      {commit.data ? (
        <p className="mt-2 text-sm text-confirmed">
          Committed {commit.data.created}, rejected {commit.data.rejected}.
        </p>
      ) : (
        <button
          disabled={!csv || commit.isPending}
          className="mt-3 rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast disabled:opacity-50"
          onClick={() => commit.mutate({ csv })}
        >
          {commit.isPending ? "Committing…" : "Commit (re-parses server-side)"}
        </button>
      )}
    </Drawer>
  );
}
