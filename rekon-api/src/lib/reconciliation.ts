import { Decimal } from "decimal.js";
import type { CurrencyCode } from "./money.js";
import { isCurrencyCode } from "./money.js";

// Largest-remainder apportionment. The defining property: the allocated parts sum
// to EXACTLY the input total — no penny is created or lost. decimal.js is not used
// here; pure integer (bigint) math makes exactness provable.

export interface AllocationLine {
  id: string;
  referenceValueMinor: bigint;
}

export interface AllocationResult {
  id: string;
  allocatedMinor: bigint;
}

// Allocate `cashMinor` across `lines` proportionally to referenceValueMinor using
// the largest-remainder method. Ties in the remainder are broken deterministically
// by line id (ascending). When every weight is zero, falls back to an equal split
// (also largest-remainder, so it still ties exactly). Throws if there is cash to
// allocate but no lines to allocate it to.
export function allocateRealizedCash(
  cashMinor: bigint,
  currency: CurrencyCode,
  lines: readonly AllocationLine[],
): AllocationResult[] {
  if (!isCurrencyCode(currency)) {
    throw new Error(`Unknown currency: ${currency}`);
  }
  if (lines.length === 0) {
    if (cashMinor !== 0n) {
      throw new Error("Cannot allocate cash with no lines");
    }
    return [];
  }
  if (cashMinor < 0n) {
    // HARDEN: negative-cash apportionment (clawbacks) is out of scope for the
    // largest-remainder path; model those as explicit reversals instead.
    throw new Error("allocateRealizedCash requires non-negative cash");
  }

  const totalWeight = lines.reduce((acc, l) => acc + l.referenceValueMinor, 0n);

  // Zero weights → equal split.
  const useEqualSplit = totalWeight === 0n;
  const n = BigInt(lines.length);

  interface Work {
    id: string;
    base: bigint;
    remainder: bigint; // numerator remainder for tiebreak ordering
  }

  const work: Work[] = lines.map((l) => {
    if (useEqualSplit) {
      return { id: l.id, base: cashMinor / n, remainder: cashMinor % n };
    }
    const numerator = cashMinor * l.referenceValueMinor;
    return {
      id: l.id,
      base: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });

  const allocatedSoFar = work.reduce((acc, w) => acc + w.base, 0n);
  let leftover = cashMinor - allocatedSoFar;

  // Distribute leftover minor units to the largest remainders first; break ties by
  // id ascending for determinism.
  const order = [...work].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const bump = new Map<string, bigint>();
  let i = 0;
  while (leftover > 0n) {
    const w = order[i % order.length];
    if (w === undefined) break; // unreachable; satisfies noUncheckedIndexedAccess
    bump.set(w.id, (bump.get(w.id) ?? 0n) + 1n);
    leftover -= 1n;
    i += 1;
  }

  return work.map((w) => ({
    id: w.id,
    allocatedMinor: w.base + (bump.get(w.id) ?? 0n),
  }));
}

// The realized FX rate implied by receiving `cashMinor` against an accrued `totalMinor`.
// Returned as a decimal string so it can be stored verbatim (never a float column).
export function realizedRate(cashMinor: bigint, totalMinor: bigint): string {
  if (totalMinor === 0n) {
    throw new Error("Cannot compute realized rate against zero total");
  }
  return new Decimal(cashMinor.toString())
    .dividedBy(new Decimal(totalMinor.toString()))
    .toString();
}

// Convert a functional-currency minor amount to another currency's minor units at
// `ratePerUnit` (target minor per functional minor), rounding half-up. All supported
// currencies share a 2-decimal scale, so no scale adjustment is needed here.
export function convertAtRate(
  functionalMinor: bigint,
  ratePerUnit: string | Decimal,
  currency: CurrencyCode,
): bigint {
  if (!isCurrencyCode(currency)) {
    throw new Error(`Unknown currency: ${currency}`);
  }
  const rate = ratePerUnit instanceof Decimal ? ratePerUnit : new Decimal(ratePerUnit);
  const result = new Decimal(functionalMinor.toString())
    .times(rate)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return BigInt(result.toFixed(0));
}
