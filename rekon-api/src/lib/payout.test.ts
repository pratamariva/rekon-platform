import { describe, it, expect } from "vitest";
import { drawDownLedgers, alreadyPaid } from "./payout.js";

describe("drawDownLedgers — Infinite Catalog oracle", () => {
  it("pays entirely from the positive Publishing ledger, skipping the negative Primary", () => {
    // Primary −$1000, Publishing +$750, pay $750 → all from Publishing.
    const debits = drawDownLedgers(
      [
        { ledgerId: null, currency: "USD", amountMinor: -100000n },
        { ledgerId: "pub", currency: "USD", amountMinor: 75000n },
      ],
      75000n,
    );
    expect(debits).toEqual([
      { ledgerId: "pub", currency: "USD", amountMinor: -75000n },
    ]);
  });

  it("takes from the largest positive ledger first and ties exactly", () => {
    const debits = drawDownLedgers(
      [
        { ledgerId: "a", currency: "USD", amountMinor: 3000n },
        { ledgerId: "b", currency: "USD", amountMinor: 10000n },
      ],
      11000n,
    );
    expect(debits[0]).toEqual({ ledgerId: "b", currency: "USD", amountMinor: -10000n });
    expect(debits[1]).toEqual({ ledgerId: "a", currency: "USD", amountMinor: -1000n });
    expect(debits.reduce((a, d) => a + d.amountMinor, 0n)).toBe(-11000n);
  });

  it("throws when the amount exceeds payable", () => {
    expect(() =>
      drawDownLedgers([{ ledgerId: "a", currency: "USD", amountMinor: 100n }], 200n),
    ).toThrow();
  });
});

describe("alreadyPaid", () => {
  it("negates the sum of debit postings", () => {
    expect(alreadyPaid([{ amountMinor: -75000n }, { amountMinor: -1000n }])).toBe(76000n);
  });
});
