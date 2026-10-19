import { createHash } from "node:crypto";
import type { NormalizedLine } from "./types.js";

// A stable catalog-item key for a normalized line: sha256(isrc | title). Lines that
// share an ISRC (or, lacking one, a title) collapse to the same Item per source.
export function itemMetaKey(line: Pick<NormalizedLine, "isrc" | "title">): string {
  return createHash("sha256")
    .update(`${line.isrc ?? ""}|${line.title ?? ""}`)
    .digest("hex");
}
