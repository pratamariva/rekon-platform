import { zipSync, type Zippable } from "fflate";

export interface ProofSource {
  name: string;
  url: string; // may be a data: URL or an http(s) URL
}

export interface DownloadProgress {
  loaded: number;
  total: number;
}

// Fetch a set of proof files and bundle them into a store-only (uncompressed, fast)
// zip. Reports byte-accurate READ progress. Dedupes duplicate names by suffixing.
export async function downloadProofsZip(
  proofs: readonly ProofSource[],
  onProgress?: (p: DownloadProgress) => void,
): Promise<Blob> {
  const files: Zippable = {};
  const used = new Set<string>();
  let loaded = 0;
  const total = proofs.length;

  const uniqueName = (name: string): string => {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const dot = name.lastIndexOf(".");
    const base = dot === -1 ? name : name.slice(0, dot);
    const ext = dot === -1 ? "" : name.slice(dot);
    let i = 1;
    let candidate = `${base} (${i})${ext}`;
    while (used.has(candidate)) {
      i += 1;
      candidate = `${base} (${i})${ext}`;
    }
    used.add(candidate);
    return candidate;
  };

  for (const proof of proofs) {
    const res = await fetch(proof.url);
    const buf = new Uint8Array(await res.arrayBuffer());
    files[uniqueName(proof.name)] = buf;
    loaded += 1;
    onProgress?.({ loaded, total });
  }

  // level: 0 → store-only (no compression) for speed; proofs are already compressed.
  const zipped = zipSync(files, { level: 0 });
  // Copy into a fresh ArrayBuffer so the Blob gets a plain ArrayBuffer (not a view
  // that may be a SharedArrayBuffer) — keeps TS Blob typings happy.
  const out = new Uint8Array(zipped.length);
  out.set(zipped);
  return new Blob([out], { type: "application/zip" });
}
