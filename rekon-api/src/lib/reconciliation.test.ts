import { describe, it, expect } from "vitest";
import {
  allocateRealizedCash,
  realizedRate,
  convertAtRate,
} from "./reconciliation.js";

const alloc = (cash: bigint, lines: { id: string; referenceValueMinor: bigint }[]) =>
  allocateRealizedCash(cash, "USD", lines);

const total = (r: { allocatedMinor: bigint }[]) =>
  r.reduce((a, b) => a + b.allocatedMinor, 0n);

describe("allocateRealizedCash (largest remainder)", () => {
  it("splits proportionally when it divides evenly", () => {
    const r = alloc(100000n, [
      { id: "a", referenceValueMinor: 50n },
      { id: "b", referenceValueMinor: 50n },
    ]);
    expect(r).toEqual([
      { id: "a", allocatedMinor: 50000n },
      { id: "b", allocatedMinor: 50000n },
    ]);
  });

  it("ties EXACTLY on an indivisible split, tiebreak by id ascending", () => {
    // 100 cents split 3 ways → 34/33/33, leftover penny to lowest id.
    const r = alloc(100n, [
      { id: "a", referenceValueMinor: 1n },
      { id: "b", referenceValueMinor: 1n },
      { id: "c", referenceValueMinor: 1n },
    ]);
    expect(total(r)).toBe(100n);
    const byId = Object.fromEntries(r.map((x) => [x.id, x.allocatedMinor]));
    expect(byId.a).toBe(34n);
    expect(byId.b).toBe(33n);
    expect(byId.c).toBe(33n);
  });

  it("falls back to an equal split when all weights are zero", () => {
    const r = alloc(100n, [
      { id: "a", referenceValueMinor: 0n },
      { id: "b", referenceValueMinor: 0n },
      { id: "c", referenceValueMinor: 0n },
    ]);
    expect(total(r)).toBe(100n);
    expect(r.map((x) => x.allocatedMinor)).toEqual([34n, 33n, 33n]);
  });

  it("throws when there is cash but no lines", () => {
    expect(() => alloc(1n, [])).toThrow();
  });

  it("allocates nothing across empty lines for zero cash", () => {
    expect(alloc(0n, [])).toEqual([]);
  });
});

describe("realizedRate", () => {
  it("returns the implied rate as a decimal string", () => {
    expect(realizedRate(75000n, 100000n)).toBe("0.75");
  });
  it("throws on zero total", () => {
    expect(() => realizedRate(1n, 0n)).toThrow();
  });
});

describe("convertAtRate (half-up)", () => {
  it("rounds half up to integer minor units", () => {
    // 100 functional minor * 0.005 = 0.5 → 1 (half up)
    expect(convertAtRate(100n, "0.005", "USD")).toBe(1n);
    // 100 * 0.004 = 0.4 → 0
    expect(convertAtRate(100n, "0.004", "USD")).toBe(0n);
  });
});
