import { useState } from "react";
import { trpc } from "../trpc.js";
import { Drawer } from "../components/Drawer.js";

type Role = "artist" | "producer" | "writer" | "featured" | "mixer" | "label";
const ROLES: Role[] = ["artist", "producer", "writer", "featured", "mixer", "label"];

interface SplitRow {
  payeeId: string;
  role: Role;
  sharePct: string; // percent string for input
  ledgerId: string; // "" = Primary
}

export function Contracts() {
  const contracts = trpc.contracts.list.useQuery();
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Contracts</h1>
        <button
          className="ml-auto rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast"
          onClick={() => setEditing(true)}
        >
          New contract
        </button>
      </div>

      <div className="space-y-2">
        {contracts.data?.map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-surface p-3">
            <div className="font-medium">{c.name}</div>
            <ul className="mt-1 text-sm text-text-muted">
              {c.splits.map((s) => (
                <li key={s.id}>
                  {s.payee.name} — {(s.shareBp / 100).toFixed(2)}% ({s.role})
                  {s.ledger ? ` · ${s.ledger.name}` : " · Primary"}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {editing && <ContractEditor onClose={() => setEditing(false)} />}
    </div>
  );
}

function ContractEditor({ onClose }: { onClose: () => void }) {
  const payees = trpc.payees.list.useQuery();
  const ledgers = trpc.contracts.listLedgers.useQuery();
  const utils = trpc.useUtils();
  const upsert = trpc.contracts.upsert.useMutation({
    onSuccess: () => {
      void utils.contracts.list.invalidate();
      onClose();
    },
  });

  const [name, setName] = useState("");
  const [rows, setRows] = useState<SplitRow[]>([
    { payeeId: "", role: "artist", sharePct: "50", ledgerId: "" },
  ]);

  const payeeBpTotal = rows.reduce((a, r) => a + Math.round(Number(r.sharePct || "0") * 100), 0);
  const labelRemainder = 10000 - payeeBpTotal;
  const over = labelRemainder < 0;
  const valid = name && rows.every((r) => r.payeeId) && !over;

  const save = () => {
    upsert.mutate({
      name,
      splits: rows.map((r) => ({
        payeeId: r.payeeId,
        role: r.role,
        shareBp: Math.round(Number(r.sharePct || "0") * 100),
        ledgerId: r.ledgerId || null,
      })),
    });
  };

  return (
    <Drawer title="New contract" onClose={onClose}>
      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-text-muted">Contract name</span>
        <input
          className="w-full rounded border border-border bg-bg px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <select
              className="rounded border border-border bg-surface px-2 py-1"
              value={r.payeeId}
              onChange={(e) =>
                setRows((p) => p.map((row, j) => (j === i ? { ...row, payeeId: e.target.value } : row)))
              }
            >
              <option value="">Payee…</option>
              {payees.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-border bg-surface px-2 py-1"
              value={r.role}
              onChange={(e) =>
                setRows((p) => p.map((row, j) => (j === i ? { ...row, role: e.target.value as Role } : row)))
              }
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <input
              type="number"
              className="w-20 rounded border border-border bg-bg px-2 py-1 text-right tabular"
              value={r.sharePct}
              onChange={(e) =>
                setRows((p) => p.map((row, j) => (j === i ? { ...row, sharePct: e.target.value } : row)))
              }
            />
            <span className="text-text-subtle">%</span>
            <select
              className="rounded border border-border bg-surface px-2 py-1"
              value={r.ledgerId}
              onChange={(e) =>
                setRows((p) => p.map((row, j) => (j === i ? { ...row, ledgerId: e.target.value } : row)))
              }
            >
              <option value="">Primary</option>
              {ledgers.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button
              className="text-disputed"
              aria-label="Remove row"
              onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        className="mt-2 text-sm text-brand underline"
        onClick={() =>
          setRows((p) => [...p, { payeeId: "", role: "artist", sharePct: "0", ledgerId: "" }])
        }
      >
        + Add payee
      </button>

      <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm">
        <span>Label remainder</span>
        <span className={over ? "text-disputed" : "text-text-muted"}>
          {(labelRemainder / 100).toFixed(2)}%
        </span>
      </div>
      {over && (
        <p role="alert" className="text-sm text-disputed">
          Payee shares exceed 100%.
        </p>
      )}

      <button
        disabled={!valid || upsert.isPending}
        className="mt-3 rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast disabled:opacity-50"
        onClick={save}
      >
        {upsert.isPending ? "Saving…" : "Save contract"}
      </button>
    </Drawer>
  );
}
