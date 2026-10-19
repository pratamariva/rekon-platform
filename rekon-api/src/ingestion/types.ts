import type { CurrencyCode } from "../lib/money.js";

// A single normalized revenue line, currency-explicit and in integer minor units.
export interface NormalizedLine {
  source: string;
  revenueType: string;
  nativeCurrency: CurrencyCode;
  nativeAmountMinor: bigint;
  isrc?: string;
  upc?: string;
  title?: string;
  artist?: string;
  releaseName?: string;
  catalogNo?: string;
}

export interface RejectedRow {
  rowNumber: number; // 1-based data row (excludes header)
  reason: string;
  raw: Record<string, string>;
}

export interface ParseResult {
  source: string;
  importer: string;
  period: string;
  lines: NormalizedLine[];
  rejected: RejectedRow[];
  totalsByCurrency: { currency: CurrencyCode; totalMinor: bigint }[];
}

// Candidate column header names for each field. First match (case-insensitive,
// trimmed) wins. HARDEN: these are best-guess candidates — verify against real
// distributor sample files before trusting them in production.
export interface ColumnCandidates {
  amount: string[];
  currency?: string[]; // when omitted, the profile supplies a fixed currency
  isrc?: string[];
  upc?: string[];
  title?: string[];
  artist?: string[];
  releaseName?: string[];
  catalogNo?: string[];
  period?: string[];
  revenueType?: string[];
}

export interface DistributorProfile {
  sourceId: string; // distributor key, e.g. "fuga"
  importerLabel: string; // human label, e.g. "FUGA — Revenue report"
  delimiter: string;
  decimal: "." | ","; // decimal separator used in money cells
  fixedCurrency?: CurrencyCode; // when the file has no currency column
  columns: ColumnCandidates;
}
