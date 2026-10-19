import { trpc } from "../trpc.js";
import { Money } from "../components/Money.js";

export function MyStatements() {
  const statements = trpc.payeePortal.myStatements.useQuery();

  const download = (title: string, rows: string[][]) => {
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">My statements</h1>
      <p className="text-sm text-text-muted">
        Only statements you participate in are shown, with your own frozen share.
      </p>
      <ul className="space-y-2">
        {statements.data?.map((s) => (
          <li
            key={s.statementId}
            className="flex items-center justify-between rounded border border-border bg-surface p-3 text-sm"
          >
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="text-text-subtle">
                {s.period} · issued {s.issuedAt ? new Date(s.issuedAt).toLocaleDateString() : "—"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Money minor={s.myShareFunctionalMinor} currency="IDR" />
              <button
                className="rounded border border-border px-2 py-1 text-xs"
                onClick={() =>
                  download(s.title, [
                    ["Statement", "Period", "My share (IDR minor)"],
                    [s.title, s.period, String(s.myShareFunctionalMinor)],
                  ])
                }
              >
                Download
              </button>
            </div>
          </li>
        ))}
        {statements.data?.length === 0 && (
          <li className="text-text-subtle">No statements yet.</li>
        )}
      </ul>
    </div>
  );
}
