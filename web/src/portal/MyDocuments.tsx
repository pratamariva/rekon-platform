import { useMemo, useState } from "react";
import { trpc } from "../trpc.js";
import { Money } from "../components/Money.js";
import { downloadProofsZip } from "../lib/downloadProofs.js";

export function MyDocuments() {
  const docs = trpc.payeePortal.myDocuments.useQuery();
  const [q, setQ] = useState("");
  const [progress, setProgress] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const all = docs.data ?? [];
    if (!q) return all;
    return all.filter((d) => `receipt-${d.payoutId}`.includes(q.toLowerCase()));
  }, [docs.data, q]);

  const downloadAll = async () => {
    const sources = filtered
      .filter((d) => d.proofUrl)
      .map((d) => ({ name: `receipt-${d.payoutId}`, url: d.proofUrl! }));
    if (sources.length === 0) return;
    const blob = await downloadProofsZip(sources, (p) =>
      setProgress(`${p.loaded}/${p.total}`),
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-documents.zip";
    a.click();
    URL.revokeObjectURL(url);
    setProgress(null);
  };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">My documents</h1>
      <p className="text-sm text-text-muted">Your payment receipts. Download-only.</p>
      <div className="flex gap-2">
        <input
          className="rounded border border-border bg-surface px-3 py-1.5 text-sm"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="rounded border border-border px-3 py-1.5 text-sm"
          onClick={() => void downloadAll()}
        >
          {progress ? `Zipping ${progress}…` : "Download all (zip)"}
        </button>
      </div>
      <ul className="space-y-2">
        {filtered.map((d) => (
          <li
            key={d.payoutId}
            className="flex items-center justify-between rounded border border-border bg-surface p-3 text-sm"
          >
            <span>
              receipt-{d.payoutId.slice(0, 8)} ·{" "}
              {d.paidAt ? new Date(d.paidAt).toLocaleDateString() : "—"}
            </span>
            <div className="flex items-center gap-3">
              <Money minor={d.amountMinor} currency={d.currency} />
              {d.proofUrl && (
                <a
                  href={d.proofUrl}
                  download={`receipt-${d.payoutId}`}
                  className="rounded border border-border px-2 py-1 text-xs"
                >
                  Download
                </a>
              )}
            </div>
          </li>
        ))}
        {filtered.length === 0 && <li className="text-text-subtle">No documents.</li>}
      </ul>
    </div>
  );
}
