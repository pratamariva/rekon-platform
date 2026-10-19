import { isCurrencyCode, type CurrencyCode } from "../lib/money.js";
import { parseCsv, parseMoneyCell } from "./csv.js";
import { getProfile } from "./profiles.js";
import type {
  ColumnCandidates,
  NormalizedLine,
  ParseResult,
  RejectedRow,
} from "./types.js";

export interface ParseOverrides {
  // Override the resolved header name for a field, e.g. { amount: "Total" }.
  columns?: Partial<Record<keyof ColumnCandidates, string>>;
  period?: string;
}

// Normalize a reporting period string to "YYYY-Qn" or "YYYY-MM" where recognizable;
// otherwise return the trimmed input unchanged.
export function normalizePeriod(raw: string): string {
  const s = raw.trim();
  const q = s.match(/(\d{4}).*?Q([1-4])|Q([1-4]).*?(\d{4})/i);
  if (q) {
    const year = q[1] ?? q[4];
    const quarter = q[2] ?? q[3];
    if (year && quarter) return `${year}-Q${quarter}`;
  }
  const ym = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ym && ym[1] && ym[2]) return `${ym[1]}-${ym[2].padStart(2, "0")}`;
  return s;
}

function headerIndex(
  header: string[],
  candidates: string[] | undefined,
  override: string | undefined,
): number {
  const names = override ? [override] : (candidates ?? []);
  for (const name of names) {
    const idx = header.findIndex(
      (h) => h.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

// Parse a distributor statement CSV into normalized lines. Maps columns via the
// profile's candidates (override-able), validates currency, totals by currency, and
// rejects bad rows with a reason — never silently dropping or rounding anything.
export function parseStatementCsv(
  importerId: string,
  text: string,
  overrides: ParseOverrides = {},
): ParseResult {
  const profile = getProfile(importerId);
  const rows = parseCsv(text, profile.delimiter);
  if (rows.length === 0) {
    throw new Error("Empty file");
  }
  const header = rows[0] ?? [];
  const dataRows = rows.slice(1);
  const ov = overrides.columns ?? {};

  const idx = {
    amount: headerIndex(header, profile.columns.amount, ov.amount),
    currency: headerIndex(header, profile.columns.currency, ov.currency),
    isrc: headerIndex(header, profile.columns.isrc, ov.isrc),
    upc: headerIndex(header, profile.columns.upc, ov.upc),
    title: headerIndex(header, profile.columns.title, ov.title),
    artist: headerIndex(header, profile.columns.artist, ov.artist),
    releaseName: headerIndex(header, profile.columns.releaseName, ov.releaseName),
    catalogNo: headerIndex(header, profile.columns.catalogNo, ov.catalogNo),
    period: headerIndex(header, profile.columns.period, ov.period),
    revenueType: headerIndex(header, profile.columns.revenueType, ov.revenueType),
  };

  if (idx.amount === -1) {
    throw new Error(
      `Could not find an amount column. Expected one of: ${profile.columns.amount.join(", ")}`,
    );
  }

  const lines: NormalizedLine[] = [];
  const rejected: RejectedRow[] = [];
  const totals = new Map<CurrencyCode, bigint>();
  let periodFromData = "";

  const cell = (row: string[], i: number): string | undefined =>
    i === -1 ? undefined : row[i];

  dataRows.forEach((row, n) => {
    const rowNumber = n + 1;
    const raw: Record<string, string> = {};
    header.forEach((h, i) => (raw[h] = row[i] ?? ""));

    // Skip fully-empty rows silently (trailing blank lines).
    if (row.every((c) => c.trim() === "")) return;

    const amountCell = cell(row, idx.amount)?.trim() ?? "";
    if (amountCell === "") {
      rejected.push({ rowNumber, reason: "Missing amount", raw });
      return;
    }

    const currencyCol = cell(row, idx.currency)?.trim().toUpperCase();
    const columnCurrency =
      currencyCol && isCurrencyCode(currencyCol) ? currencyCol : undefined;
    if (currencyCol && !columnCurrency) {
      rejected.push({ rowNumber, reason: `Unsupported currency "${currencyCol}"`, raw });
      return;
    }

    try {
      const probeCurrency = columnCurrency ?? profile.fixedCurrency ?? "USD";
      const parsed = parseMoneyCell(amountCell, {
        decimal: profile.decimal,
        currency: probeCurrency,
      });
      const currency = columnCurrency ?? parsed.currency ?? profile.fixedCurrency;
      if (!currency) {
        rejected.push({ rowNumber, reason: "Could not determine currency", raw });
        return;
      }

      const periodCell = cell(row, idx.period)?.trim();
      if (periodCell && !periodFromData) periodFromData = normalizePeriod(periodCell);

      const line: NormalizedLine = {
        source: profile.sourceId,
        revenueType: cell(row, idx.revenueType)?.trim() || "royalty",
        nativeCurrency: currency,
        nativeAmountMinor: parsed.minor,
      };
      const isrc = cell(row, idx.isrc)?.trim();
      const upc = cell(row, idx.upc)?.trim();
      const title = cell(row, idx.title)?.trim();
      const artist = cell(row, idx.artist)?.trim();
      const releaseName = cell(row, idx.releaseName)?.trim();
      const catalogNo = cell(row, idx.catalogNo)?.trim();
      if (isrc) line.isrc = isrc;
      if (upc) line.upc = upc;
      if (title) line.title = title;
      if (artist) line.artist = artist;
      if (releaseName) line.releaseName = releaseName;
      if (catalogNo) line.catalogNo = catalogNo;

      lines.push(line);
      totals.set(currency, (totals.get(currency) ?? 0n) + parsed.minor);
    } catch (err) {
      rejected.push({
        rowNumber,
        reason: err instanceof Error ? err.message : "Unparseable row",
        raw,
      });
    }
  });

  const period = overrides.period
    ? normalizePeriod(overrides.period)
    : periodFromData || "unknown";

  return {
    source: profile.sourceId,
    importer: importerId,
    period,
    lines,
    rejected,
    totalsByCurrency: [...totals.entries()].map(([currency, totalMinor]) => ({
      currency,
      totalMinor,
    })),
  };
}
