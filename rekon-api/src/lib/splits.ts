import { allocateRealizedCash } from "./reconciliation.js";
import { BASIS_POINTS_FULL } from "./contracts.js";
import { Decimal } from "decimal.js";

export interface TrackSplitInput {
  // Weight to roll up by (e.g. revenue or streams, in minor units or raw count).
  weight: bigint;
  shares: { payeeId: string; shareBp: number }[];
}

export interface RolledShare {
  payeeId: string;
  shareBp: number;
}

// Roll per-track splits up to a single release-level split, weighting each track by
// its `weight`, then snapping payee shares to integer basis points via the
// largest-remainder method. The label remainder (10000 − Σ payee bp) is preserved
// implicitly: payee shares sum to the weighted non-label pool, not forced to 10000.
export function rollUpReleaseSplit(tracks: readonly TrackSplitInput[]): RolledShare[] {
  if (tracks.length === 0) return [];

  const allZero = tracks.every((t) => t.weight === 0n);
  const weightOf = (t: TrackSplitInput): bigint => (allZero ? 1n : t.weight);

  const totalWeight = tracks.reduce((acc, t) => acc + weightOf(t), 0n);
  if (totalWeight === 0n) return [];

  // Accumulate each payee's weighted bp contribution and the weighted total bp.
  const contrib = new Map<string, bigint>();
  let weightedBpTotal = 0n;
  for (const t of tracks) {
    const w = weightOf(t);
    for (const s of t.shares) {
      contrib.set(s.payeeId, (contrib.get(s.payeeId) ?? 0n) + w * BigInt(s.shareBp));
      weightedBpTotal += w * BigInt(s.shareBp);
    }
  }
  if (contrib.size === 0) return [];

  // The payee pool in bp = weightedBpTotal / totalWeight, rounded to nearest integer.
  const pool = BigInt(
    new Decimal(weightedBpTotal.toString())
      .dividedBy(new Decimal(totalWeight.toString()))
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toFixed(0),
  );
  const cappedPool = pool > BigInt(BASIS_POINTS_FULL) ? BigInt(BASIS_POINTS_FULL) : pool;

  const lines = [...contrib.entries()].map(([payeeId, weight]) => ({
    id: payeeId,
    referenceValueMinor: weight,
  }));

  // Currency is irrelevant to apportionment; USD is a placeholder scale.
  const allocated = allocateRealizedCash(cappedPool, "USD", lines);
  return allocated.map((a) => ({ payeeId: a.id, shareBp: Number(a.allocatedMinor) }));
}
