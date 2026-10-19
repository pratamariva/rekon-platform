import { describe, it, expect } from "vitest";
import { parseMoneyCell } from "./csv.js";
import { parseStatementCsv } from "./parse.js";
import { getProfile } from "./profiles.js";

describe("parseMoneyCell", () => {
  it("parses a dot-decimal value", () => {
    expect(parseMoneyCell("1,842.50", { decimal: ".", currency: "USD" }).minor).toBe(
      184250n,
    );
  });
  it("parses a comma-decimal (EU) value", () => {
    expect(parseMoneyCell("1.842,50", { decimal: ",", currency: "EUR" }).minor).toBe(
      184250n,
    );
  });
  it("treats parentheses as negative", () => {
    expect(parseMoneyCell("(42.00)", { decimal: ".", currency: "USD" }).minor).toBe(
      -4200n,
    );
  });
  it("strips a currency symbol and reports it", () => {
    const r = parseMoneyCell("$10.00", { decimal: ".", currency: "USD" });
    expect(r.minor).toBe(1000n);
    expect(r.currency).toBe("USD");
  });
  it("rejects over-precise values instead of rounding", () => {
    expect(() => parseMoneyCell("1.005", { decimal: ".", currency: "USD" })).toThrow();
  });
});

describe("parseStatementCsv", () => {
  it("parses a FUGA (dot-decimal) revenue export", () => {
    const csv = [
      "ISRC,Track Title,Artist,Net Revenue,Currency,Reporting Period,Store",
      "IDA012600001,Hujan,Andi,1842.50,USD,2026-Q2,Spotify",
      "IDA012600002,Senja,Andi,963.20,USD,2026-Q2,Apple Music",
    ].join("\n");
    const r = parseStatementCsv("fuga:revenue", csv);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]?.nativeAmountMinor).toBe(184250n);
    expect(r.lines[0]?.isrc).toBe("IDA012600001");
    expect(r.period).toBe("2026-Q2");
    expect(r.totalsByCurrency).toEqual([{ currency: "USD", totalMinor: 280570n }]);
  });

  it("parses a Believe (semicolon + comma-decimal) royalty statement", () => {
    const csv = [
      "ISRC;Title;Artiste;Net Amount;Devise;Periode;Plateforme",
      "IDA012600003;Pulang;Maya;418,00;EUR;Q2 2026;Deezer",
    ].join("\n");
    const r = parseStatementCsv("believe:royalty", csv);
    expect(r.lines[0]?.nativeAmountMinor).toBe(41800n);
    expect(r.lines[0]?.nativeCurrency).toBe("EUR");
    expect(r.period).toBe("2026-Q2");
  });

  it("rejects bad rows with a reason instead of dropping them silently", () => {
    const csv = [
      "ISRC,Track Title,Artist,Net Revenue,Currency",
      "IDA1,Good,Andi,10.00,USD",
      "IDA2,BadMoney,Andi,10.005,USD",
      "IDA3,BadCurrency,Andi,10.00,XYZ",
    ].join("\n");
    const r = parseStatementCsv("fuga:revenue", csv);
    expect(r.lines).toHaveLength(1);
    expect(r.rejected).toHaveLength(2);
    expect(r.rejected.map((x) => x.rowNumber)).toEqual([2, 3]);
  });

  it("throws for an unknown importer", () => {
    expect(() => parseStatementCsv("nope:whatever", "a,b")).toThrow(/request an importer/i);
  });

  it("exposes importer profiles with ids shaped source:importer", () => {
    expect(getProfile("fuga:revenue").sourceId).toBe("fuga");
    expect(getProfile("believe:royalty").delimiter).toBe(";");
  });
});
