import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../trpc.js";
import { Drawer } from "../components/Drawer.js";
import { AssignContract } from "../components/AssignContract.js";
import { ReleaseSplitRecommendation } from "./ReleaseSplitRecommendation.js";

export function Catalog() {
  const tree = trpc.catalog.tree.useQuery();
  const [creating, setCreating] = useState(false);
  const [recommendRelease, setRecommendRelease] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Catalog</h1>
        <button
          className="ml-auto rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast"
          onClick={() => setCreating(true)}
        >
          Add to catalog
        </button>
      </div>

      {tree.data && tree.data.unassignedItemCount > 0 && (
        <p className="rounded bg-provisional-bg p-2 text-sm text-provisional">
          {tree.data.unassignedItemCount} unassigned item(s).{" "}
          <Link to="/cleanup" className="underline">
            Go to Cleanup
          </Link>
        </p>
      )}

      {tree.data?.artists.map((artist) => (
        <section key={artist.id} className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-2 font-semibold">{artist.name}</h2>
          {artist.releases.map((rel) => (
            <div key={rel.id} className="mb-3 rounded border border-border p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-medium">{rel.title}</span>
                {rel.missingContract && (
                  <span className="rounded-full bg-disputed-bg px-2 text-xs text-disputed">
                    No contract
                  </span>
                )}
                <button
                  className="ml-auto rounded border border-border px-2 py-1 text-xs"
                  onClick={() => setRecommendRelease(rel.id)}
                >
                  Recommend split
                </button>
              </div>
              <div className="mb-2 text-xs text-text-muted">Release contract:</div>
              <AssignContract level="release" targetId={rel.id} />
              <ul className="mt-3 space-y-2">
                {rel.tracks.map((t) => (
                  <li key={t.id} className="rounded bg-surface-2 p-2">
                    <div className="flex items-center gap-2">
                      <Link to={`/catalog/track/${t.id}`} className="text-sm text-brand underline">
                        {t.title}
                      </Link>
                      {t.hasTrackContract && (
                        <span className="rounded-full bg-confirmed-bg px-2 text-xs text-confirmed">
                          Track contract
                        </span>
                      )}
                      <span className="ml-auto text-xs text-text-subtle tabular">{t.isrc}</span>
                    </div>
                    <div className="mt-1">
                      <AssignContract level="track" targetId={t.id} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {tree.data && tree.data.unknownArtistReleases.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-2 font-semibold text-text-muted">Releases without an artist</h2>
          {tree.data.unknownArtistReleases.map((rel) => (
            <div key={rel.id} className="text-sm">
              {rel.title}
            </div>
          ))}
        </section>
      )}

      {creating && <CreateCatalogDrawer onClose={() => setCreating(false)} />}
      {recommendRelease && (
        <ReleaseSplitRecommendation
          releaseId={recommendRelease}
          onClose={() => setRecommendRelease(null)}
        />
      )}
    </div>
  );
}

function CreateCatalogDrawer({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"artist" | "release" | "track" | "spotify">("artist");
  const utils = trpc.useUtils();
  const done = () => {
    void utils.catalog.invalidate();
  };
  const createArtist = trpc.catalog.createArtist.useMutation({ onSuccess: done });
  const createRelease = trpc.catalog.createRelease.useMutation({ onSuccess: done });
  const createTrack = trpc.catalog.createTrack.useMutation({ onSuccess: done });
  const fromSpotify = trpc.catalog.createFromSpotify.useMutation();

  const [name, setName] = useState("");
  const [releaseId, setReleaseId] = useState("");
  const releases = trpc.catalog.search.useQuery({ q: "" });

  return (
    <Drawer title="Add to catalog" onClose={onClose}>
      <div className="mb-4 flex gap-1 text-sm">
        {(["artist", "release", "track", "spotify"] as const).map((t) => (
          <button
            key={t}
            className={`rounded px-2 py-1 capitalize ${tab === t ? "bg-surface-2 font-medium" : "text-text-muted"}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "artist" && (
        <div className="space-y-2">
          <input
            className="w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            placeholder="Artist name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast"
            onClick={() => createArtist.mutate({ name })}
          >
            Create artist
          </button>
        </div>
      )}

      {tab === "release" && (
        <div className="space-y-2">
          <input
            className="w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            placeholder="Release title"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast"
            onClick={() => createRelease.mutate({ title: name })}
          >
            Create release
          </button>
        </div>
      )}

      {tab === "track" && (
        <div className="space-y-2">
          <select
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
            value={releaseId}
            onChange={(e) => setReleaseId(e.target.value)}
          >
            <option value="">Select a release…</option>
            {releases.data?.releases.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
          <input
            className="w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            placeholder="Track title"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            disabled={!releaseId}
            className="rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast disabled:opacity-50"
            onClick={() => createTrack.mutate({ releaseId, title: name })}
          >
            Create track
          </button>
        </div>
      )}

      {tab === "spotify" && (
        <div className="space-y-2">
          <input
            className="w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            placeholder="Spotify URL"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="rounded bg-brand px-3 py-1.5 text-sm text-brand-contrast"
            onClick={() => fromSpotify.mutate({ spotifyUrl: name })}
          >
            Import from Spotify
          </button>
          {fromSpotify.error && (
            <p role="alert" className="text-sm text-disputed">
              {fromSpotify.error.message}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}
