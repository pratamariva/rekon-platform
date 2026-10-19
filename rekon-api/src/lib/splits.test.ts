import { describe, it, expect } from "vitest";
import { rollUpReleaseSplit } from "./splits.js";

const bpOf = (r: { payeeId: string; shareBp: number }[], id: string) =>
  r.find((x) => x.payeeId === id)?.shareBp;

describe("rollUpReleaseSplit", () => {
  it("averages payee shares across equally-weighted tracks", () => {
    // Track 1: A 100%. Track 2: A 0% / B 100%. Equal weight → A 50% / B 50%.
    const r = rollUpReleaseSplit([
      { weight: 1n, shares: [{ payeeId: "A", shareBp: 10000 }] },
      { weight: 1n, shares: [{ payeeId: "B", shareBp: 10000 }] },
    ]);
    expect(bpOf(r, "A")).toBe(5000);
    expect(bpOf(r, "B")).toBe(5000);
  });

  it("weights by track revenue", () => {
    // Track 1 (weight 3): A 100%. Track 2 (weight 1): B 100%. → A 75% / B 25%.
    const r = rollUpReleaseSplit([
      { weight: 3n, shares: [{ payeeId: "A", shareBp: 10000 }] },
      { weight: 1n, shares: [{ payeeId: "B", shareBp: 10000 }] },
    ]);
    expect(bpOf(r, "A")).toBe(7500);
    expect(bpOf(r, "B")).toBe(2500);
  });

  it("preserves an implicit label remainder (payee shares need not fill 10000)", () => {
    // Single track: A 80%, label 20%. Rolled up → A 80%, payee total 8000.
    const r = rollUpReleaseSplit([
      { weight: 1n, shares: [{ payeeId: "A", shareBp: 8000 }] },
    ]);
    expect(bpOf(r, "A")).toBe(8000);
    expect(r.reduce((a, b) => a + b.shareBp, 0)).toBe(8000);
  });

  it("falls back to equal weighting when all weights are zero", () => {
    const r = rollUpReleaseSplit([
      { weight: 0n, shares: [{ payeeId: "A", shareBp: 10000 }] },
      { weight: 0n, shares: [{ payeeId: "B", shareBp: 10000 }] },
    ]);
    expect(bpOf(r, "A")).toBe(5000);
    expect(bpOf(r, "B")).toBe(5000);
  });
});
