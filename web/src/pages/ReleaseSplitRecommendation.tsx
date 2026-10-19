import { useEffect, useState } from "react";
import { trpc } from "../trpc.js";
import { Drawer } from "../components/Drawer.js";

interface Row {
  payeeId: string;
  shareBp: number;
}

// Pro-rata recommendation, editable, with a live label remainder. Apply saves a
// contract (contracts.upsert) and assigns it at the release level.
export function ReleaseSplitRecommendation({
  releaseId,
  onClose,
}: {
  releaseId: string;
  onClose: () => void;
}) {
  const rec = trpc.contracts.recommendRelease.useQuery({ releaseId });
  const payees = trpc.payees.list.useQuery();
  const utils = trpc.useUtils();
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("Recommended release split");

  useEffect(() => {
    if (rec.data) setRows(rec.data.map((r) => ({ payeeId: r.payeeId, shareBp: r.shareBp })));
  }, [rec.data]);

  const nameOf = (id: string) => payees.data?.find((p) => p.id === id)?.name ?? id;
  const payeeTotal = rows.reduce((a, r) => a + r.shareBp, 0);
  const labelRemainder = 10000 - payeeTotal;
  const overAllocated = labelRemainder < 0;

  const upsert = trpc.contracts.upsert.useMutation();
  const assign = trpc.contracts.assign.useMutation();

  const apply = async () => {
    const contract = await upsert.mutateAsync({
      name,
      splits: rows.map((r) => ({ payeeId: r.payeeId, role: "artist" as const, shareBp: r.shareBp })),
    });
    await assign.mutateAsync({ level: "release", contractId: contract.id, releaseId });
    await utils.catalog.invalidate();
    await utils.contracts.list.invalidate();
    onClose();
  };

  return (
    <Drawer title="Recommend release split" onClose={onClose}>
      {rec.isLoading && <p className="text-text-muted">Computing…</p>}
      {rec.data && (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-text-muted">Contract name</span>
            <input
              className="w-full rounded border border-border bg-bg px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          {rows.length === 0 && (
            <p className="text-sm text-text-subtle">
              No track contracts to roll up yet. Assign track contracts first.
            </p>
          )}

          {rows.map((r, i) => (
            <div key={r.payeeId} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{nameOf(r.payeeId)}</span>
              <input
                type="number"
                min={0}
                max={10000}
                value={r.shareBp}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((row, j) =>
                      j === i ? { ...row, shareBp: Number(e.target.value) } : row,
                    ),
                  )
                }
                className="w-24 rounded border border-border bg-bg px-2 py-1 text-right tabular"
              />
              <span className="text-text-subtle">bp ({(r.shareBp / 100).toFixed(2)}%)</span>
            </div>
          ))}

          <div className="flex justify-between border-t border-border pt-2 text-sm">
            <span>Label remainder</span>
            <span className={overAllocated ? "text-disputed" : "text-text-muted"}>
              {labelRemainder} bp ({(labelRemainder / 100).toFixed(2)}%)
            </span>
          </div>

          <button
            disabled={overAllocated || rows.length === 0 || upsert.isPending}
            className="rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast disabled:opacity-50"
            onClick={() => void apply()}
          >
            {upsert.isPending ? "Applying…" : "Apply to release"}
          </button>
        </div>
      )}
    </Drawer>
  );
}
