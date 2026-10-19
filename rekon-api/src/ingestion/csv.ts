import { Decimal } from "decimal.js";
import { CURRENCY_SCALE, isCurrencyCode, type CurrencyCode } from "../lib/money.js";

// Dependency-free, dialect-aware CSV parser. Handles quoted fields, escaped quotes
// (""), embedded delimiters/newlines, and a leading UTF-8 BOM. Not a full RFC-4180
// streaming parser, but correct for the distributor exports we ingest.
export function parseCsv(text: string, delimiter: string): string[][] {
  // Strip BOM.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i] ?? "";
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Flush trailing field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

export interface ParsedMoney {
  minor: bigint;
  currency?: CurrencyCode; // present only if a symbol/code was embedded in the cell
}

const SYMBOL_TO_CURRENCY: Record<string, CurrencyCode> = {
  $: "USD",
  "€": "EUR",
  Rp: "IDR",
  "S$": "SGD",
  "฿": "THB",
  RM: "MYR",
};

// Parse a money cell losslessly into integer minor units. Honors the given decimal
// separator, handles parentheses-negatives (1.234,56) → −, strips a leading/trailing
// currency symbol or code (and reports it), and REJECTS values with more precision
// than the currency scale allows — it NEVER silently rounds.
export function parseMoneyCell(
  raw: string,
  opts: { decimal: "." | ","; currency: CurrencyCode },
): ParsedMoney {
  let s = raw.trim();
  if (s === "") throw new Error("Empty money cell");

  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  }
  // Unicode minus.
  if (s.startsWith("−")) {
    negative = true;
    s = s.slice(1).trim();
  }

  // Detect and strip a currency symbol/code.
  let detected: CurrencyCode | undefined;
  for (const [sym, code] of Object.entries(SYMBOL_TO_CURRENCY)) {
    if (s.startsWith(sym)) {
      detected = code;
      s = s.slice(sym.length).trim();
      break;
    }
  }
  const trailingCode = s.slice(-3).toUpperCase();
  if (detected === undefined && isCurrencyCode(trailingCode)) {
    detected = trailingCode;
    s = s.slice(0, -3).trim();
  }

  // Normalize thousands vs decimal separators to a plain "123456.78".
  const decimalSep = opts.decimal;
  const thousandSep = decimalSep === "." ? "," : ".";
  s = s.split(thousandSep).join("");
  if (decimalSep === ",") s = s.replace(",", ".");

  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Unparseable money cell: "${raw}"`);
  }

  const dec = new Decimal(s);
  const scale = CURRENCY_SCALE[opts.currency];
  if (dec.decimalPlaces() > scale) {
    throw new Error(
      `Money cell "${raw}" has more than ${scale} decimal places for ${opts.currency}`,
    );
  }
  const minorDec = dec.times(new Decimal(10).pow(scale));
  let minor = BigInt(minorDec.toFixed(0));
  if (negative) minor = -minor;
  return { minor, currency: detected };
}
