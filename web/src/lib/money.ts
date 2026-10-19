import type { CurrencyCode } from "../types.js";

const SCALE: Record<CurrencyCode, number> = {
  IDR: 2,
  USD: 2,
  EUR: 2,
  SGD: 2,
  THB: 2,
  MYR: 2,
};

// Display fraction digits (IDR conventionally shows 0; others 2). Storage scale is
// always 2 — this only affects presentation.
const DISPLAY_FRAC: Record<CurrencyCode, number> = {
  IDR: 0,
  USD: 2,
  EUR: 2,
  SGD: 2,
  THB: 2,
  MYR: 2,
};

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Format minor units with an explicit currency code, tabular grouping and a true
// minus sign. Every amount shown in the UI carries its currency code.
export function formatMinor(minor: bigint, currency: CurrencyCode): string {
  const scale = SCALE[currency];
  const displayFrac = DISPLAY_FRAC[currency];
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const factor = 10n ** BigInt(scale);
  const whole = abs / factor;
  const frac = abs % factor;
  let numStr = group(whole.toString());
  if (displayFrac > 0) {
    const fracStr = frac.toString().padStart(scale, "0").slice(0, displayFrac);
    numStr = `${numStr}.${fracStr}`;
  }
  return `${currency} ${negative ? "−" : ""}${numStr}`;
}

// Parse a major-unit input string (user typing) to minor units. Returns null on an
// invalid or over-precise value, so the UI can show inline validation.
export function parseMajorToMinor(input: string, currency: CurrencyCode): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const scale = SCALE[currency];
  const [whole, frac = ""] = s.replace("-", "").split(".");
  if (frac.length > scale) return null;
  const padded = (frac + "0".repeat(scale)).slice(0, scale);
  const minor = BigInt(whole ?? "0") * 10n ** BigInt(scale) + BigInt(padded || "0");
  return s.startsWith("-") ? -minor : minor;
}

// Minor units → a plain major-unit string suitable for an <input value>.
export function minorToMajorInput(minor: bigint, currency: CurrencyCode): string {
  const scale = SCALE[currency];
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const factor = 10n ** BigInt(scale);
  const whole = abs / factor;
  const frac = (abs % factor).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

// Convert a functional-currency minor amount to a target currency at ratePerUnit
// (target minor per functional minor), rounding half-up. Mirrors the backend.
export function convertMinor(functionalMinor: bigint, ratePerUnit: number): bigint {
  const scaled = Number(functionalMinor) * ratePerUnit;
  return BigInt(Math.round(scaled));
}
