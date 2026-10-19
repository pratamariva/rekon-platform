import { describe, it, expect } from "vitest";
import { fromMajor, toDecimalMajor, add, sub, sum, formatMinor, money } from "./money.js";

describe("money", () => {
  it("builds minor units from a major string", () => {
    expect(fromMajor("1842.50", "USD").minor).toBe(184250n);
    expect(fromMajor("1000", "USD").minor).toBe(100000n);
  });

  it("rejects over-precision instead of silently rounding", () => {
    expect(() => fromMajor("1.005", "USD")).toThrow();
    expect(() => fromMajor("1.001", "IDR")).toThrow();
  });

  it("round-trips minor → major decimal", () => {
    expect(toDecimalMajor(money(184250n, "USD")).toString()).toBe("1842.5");
  });

  it("adds, subtracts and sums with currency guards", () => {
    expect(add(money(100n, "USD"), money(50n, "USD")).minor).toBe(150n);
    expect(sub(money(100n, "USD"), money(50n, "USD")).minor).toBe(50n);
    expect(sum([money(100n, "USD"), money(200n, "USD")], "USD").minor).toBe(300n);
    expect(() => add(money(1n, "USD"), money(1n, "EUR"))).toThrow();
  });

  it("formats with explicit currency code, grouping and true minus", () => {
    expect(formatMinor(100000n, "USD")).toBe("USD 1,000.00");
    expect(formatMinor(-100000n, "USD")).toBe("USD −1,000.00");
    // IDR shows 0 fraction digits.
    expect(formatMinor(3855500000n, "IDR")).toBe("IDR 38,555,000");
  });
});
