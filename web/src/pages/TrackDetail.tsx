import { useParams, Link } from "react-router-dom";
import { trpc } from "../trpc.js";
import { AssignContract } from "../components/AssignContract.js";

export function TrackDetail() {
  const { trackId } = useParams();
  const detail = trpc.catalog.trackDetail.useQuery(
    { trackId: trackId ?? "" },
    { enabled: !!trackId },
  );

  if (detail.isLoading || !detail.data) {
    return <p className="text-text-muted">Loading track…</p>;
  }
  const d = detail.data;
  const sourceLabel =
    d.source === "track"
      ? "Track-level contract"
      : d.source === "release"
        ? "Inherited from release"
        : "No contract (100% label)";

  return (
    <div className="space-y-4">
      <Link to="/catalog" className="text-sm text-brand underline">
        ← Back to catalog
      </Link>
      <h1 className="text-xl font-semibold">{d.track.title}</h1>
      <p className="text-sm text-text-muted">
        {d.release.title} · ISRC {d.track.isrc ?? "—"}
      </p>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Effective split</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-muted">
            {sourceLabel}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-text-muted">
            <tr>
              <th className="py-1">Payee</th>
              <th className="py-1 text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {d.splits.map((s) => (
              <tr key={s.payeeId} className="border-t border-border">
                <td className="py-1">{s.payeeName}</td>
                <td className="py-1 text-right tabular">{(s.shareBp / 100).toFixed(2)}%</td>
              </tr>
            ))}
            <tr className="border-t border-border text-text-muted">
              <td className="py-1">Label (implicit remainder)</td>
              <td className="py-1 text-right tabular">
                {(d.labelRemainderBp / 100).toFixed(2)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Assign / change track contract</h2>
        <AssignContract level="track" targetId={d.track.id} />
      </div>
    </div>
  );
}
