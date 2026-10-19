import { describe, it, expect } from "vitest";
import {
  applyContract,
  validateContract,
  resolveContractId,
  netPostings,
  payableFromLedgers,
  LABEL_PAYEE,
  type LedgerPosting,
} from "./contracts.js";

// Amounts in USD cents. $1000 = 100000, $200 = 20000, $100 = 10000.
const payeeOf = (postings: LedgerPosting[], payeeId: string) =>
  postings.find((p) => p.payeeId === payeeId)?.amountMinor;

describe("applyContract — Infinite Catalog oracle", () => {
  it("A: 50% of $1000 = $500, label remainder $500", () => {
    const p = applyContract(100000n, "USD", { splits: [{ payeeId: "A", shareBp: 5000 }] });
    expect(payeeOf(p, "A")).toBe(50000n);
    expect(payeeOf(p, LABEL_PAYEE)).toBe(50000n);
  });

  it("B: 60% of $1000 = $600", () => {
    const p = applyContract(100000n, "USD", { splits: [{ payeeId: "B", shareBp: 6000 }] });
    expect(payeeOf(p, "B")).toBe(60000n);
    expect(payeeOf(p, LABEL_PAYEE)).toBe(40000n);
  });

  it("C: 45% of $200 = $90", () => {
    const p = applyContract(20000n, "USD", { splits: [{ payeeId: "C", shareBp: 4500 }] });
    expect(payeeOf(p, "C")).toBe(9000n);
    expect(payeeOf(p, LABEL_PAYEE)).toBe(11000n);
  });

  it("item C: 75% of $200 = $150", () => {
    const p = applyContract(20000n, "USD", { splits: [{ payeeId: "C", shareBp: 7500 }] });
    expect(payeeOf(p, "C")).toBe(15000n);
    expect(payeeOf(p, LABEL_PAYEE)).toBe(5000n);
  });

  it("D: 80% of $100 = $80", () => {
    const p = applyContract(10000n, "USD", { splits: [{ payeeId: "D", shareBp: 8000 }] });
    expect(payeeOf(p, "D")).toBe(8000n);
    expect(payeeOf(p, LABEL_PAYEE)).toBe(2000n);
  });

  it("E: 100% of $100 = $100, no label posting", () => {
    const p = applyContract(10000n, "USD", { splits: [{ payeeId: "E", shareBp: 10000 }] });
    expect(payeeOf(p, "E")).toBe(10000n);
    expect(payeeOf(p, LABEL_PAYEE)).toBeUndefined();
  });

  it("null contract = 100% label", () => {
    const p = applyContract(10000n, "USD", null);
    expect(payeeOf(p, LABEL_PAYEE)).toBe(10000n);
  });

  it("always ties exactly to the realized total", () => {
    const p = applyContract(99999n, "USD", {
      splits: [
        { payeeId: "A", shareBp: 3333 },
        { payeeId: "B", shareBp: 3333 },
      ],
    });
    expect(p.reduce((a, b) => a + b.amountMinor, 0n)).toBe(99999n);
  });
});

describe("validateContract", () => {
  it("accepts shares up to 100%", () => {
    expect(() =>
      validateContract({ splits: [{ payeeId: "A", shareBp: 10000 }] }),
    ).not.toThrow();
  });
  it("rejects over 100%", () => {
    expect(() =>
      validateContract({
        splits: [
          { payeeId: "A", shareBp: 6000 },
          { payeeId: "B", shareBp: 6000 },
        ],
      }),
    ).toThrow();
  });
});

describe("resolveContractId (nearest-first)", () => {
  it("prefers transaction over item over track over release", () => {
    expect(
      resolveContractId({ itemContractId: "item", releaseContractId: "rel" }),
    ).toBe("item");
    expect(resolveContractId({ releaseContractId: "rel" })).toBe("rel");
    expect(resolveContractId({})).toBeNull();
  });
});

describe("ledgers", () => {
  it("payable = sum of positive ledger balances only", () => {
    // Primary −$1000 + Publishing +$750 → payable $750
    expect(
      payableFromLedgers([{ amountMinor: -100000n }, { amountMinor: 75000n }]),
    ).toBe(75000n);
  });

  it("netPostings combines by payee+ledger+currency", () => {
    const net = netPostings([
      { payeeId: "A", ledgerId: null, currency: "USD", amountMinor: 100n },
      { payeeId: "A", ledgerId: null, currency: "USD", amountMinor: 50n },
      { payeeId: "A", ledgerId: "pub", currency: "USD", amountMinor: 25n },
    ]);
    expect(net).toHaveLength(2);
    expect(net.find((p) => p.ledgerId === null)?.amountMinor).toBe(150n);
  });
});
