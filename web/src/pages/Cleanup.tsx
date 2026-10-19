import { useState } from "react";
import { trpc } from "../trpc.js";
import { Drawer } from "../components/Drawer.js";

export function Cleanup() {
  const unassigned = trpc.items.unassigned.useQuery();
  const [activeItem, setActiveItem] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Cleanup — unassigned items</h1>
      <p className="text-sm text-text-muted">
        These revenue items could not be auto-mapped to a track. Assign each to a track or
        release so its contract resolves.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-text-muted">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">ISRC</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {unassigned.data?.map((it) => (
              <tr key={it.id} className="border-t border-border">
                <td className="px-3 py-2">{it.trackName ?? "(untitled)"}</td>
                <td className="px-3 py-2 tabular">{it.isrc ?? "—"}</td>
                <td className="px-3 py-2">{it.source}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    className="rounded border border-border px-2 py-1 text-xs"
                    onClick={() => setActiveItem(it.id)}
                  >
                    Assign
                  </button>
                </td>
              </tr>
            ))}
            {unassigned.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-text-subtle">
                  Nothing to clean up. 🎉
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeItem && (
        <AssignItemDrawer itemId={activeItem} onClose={() => setActiveItem(null)} />
      )}
    </div>
  );
}

function AssignItemDrawer({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const results = trpc.catalog.search.useQuery({ q });
  const utils = trpc.useUtils();
  const onDone = () => {
    void utils.items.unassigned.invalidate();
    void utils.catalog.invalidate();
    onClose();
  };
  const assignTrack = trpc.items.assignToTrack.useMutation({ onSuccess: onDone });
  const assignRelease = trpc.items.assignToRelease.useMutation({ onSuccess: onDone });

  return (
    <Drawer title="Assign item" onClose={onClose}>
      <input
        placeholder="Search catalog…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-3 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
      />
      <h3 className="mb-1 text-sm font-semibold">Tracks</h3>
      <ul className="mb-4 space-y-1">
        {results.data?.tracks.map((t) => (
          <li key={t.id} className="flex items-center justify-between text-sm">
            <span>
              {t.title} <span className="text-text-subtle">· {t.release.title}</span>
            </span>
            <button
              className="rounded border border-border px-2 py-1 text-xs"
              onClick={() => assignTrack.mutate({ itemId, trackId: t.id })}
            >
              Assign to track
            </button>
          </li>
        ))}
      </ul>
      <h3 className="mb-1 text-sm font-semibold">Releases</h3>
      <ul className="space-y-1">
        {results.data?.releases.map((r) => (
          <li key={r.id} className="flex items-center justify-between text-sm">
            <span>{r.title}</span>
            <button
              className="rounded border border-border px-2 py-1 text-xs"
              onClick={() => assignRelease.mutate({ itemId, releaseId: r.id })}
            >
              Assign to release
            </button>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
