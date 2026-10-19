import { Decimal } from "decimal.js";

// Money is ALWAYS integer minor units (bigint) + an explicit currency.
// NEVER use JS number/float for money. decimal.js is used ONLY for ratio math,
// after which we round back to integer minor units.

export type CurrencyCode = "IDR" | "USD" | "EUR" | "SGD" | "THB" | "MYR";

export const CURRENCY_CODES: readonly CurrencyCode[] = [
  "IDR",
  "USD",
  "EUR",
  "SGD",
  "THB",
  "MYR",
] as const;

// Decimal places used to display/parse major units. All currencies here use 2.
// NOTE: IDR is conventionally displayed with 0 fraction digits, but we still store
// 2-decimal minor units for a single uniform integer scale across the ledger.
// HARDEN: if you add a 0- or 3-decimal currency, revisit CURRENCY_SCALE and every
// caller that assumes a shared scale.
export const CURRENCY_SCALE: Record<CurrencyCode, number> = {
  IDR: 2,
  USD: 2,
  EUR: 2,
  SGD: 2,
  THB: 2,
  MYR: 2,
};

export interface Money {
  minor: bigint;
  currency: CurrencyCode;
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(value);
}

export function money(minor: bigint, currency: CurrencyCode): Money {
  return { minor, currency };
}

function scaleFactor(currency: CurrencyCode): bigint {
  const scale = CURRENCY_SCALE[currency];
  return 10n ** BigInt(scale);
}

// Build Money from a major-unit decimal string/Decimal. Rejects values with more
// precision than the currency scale allows (never silently rounds).
export function fromMajor(major: string | Decimal, currency: CurrencyCode): Money {
  const dec = major instanceof Decimal ? major : new Decimal(major);
  const scale = CURRENCY_SCALE[currency];
  if (dec.decimalPlaces() > scale) {
    throw new Error(
      `Value ${dec.toString()} has more than ${scale} decimal places for ${currency}`,
    );
  }
  const minorDec = dec.times(new Decimal(10).pow(scale));
  // minorDec is now an integer by construction; assert it.
  if (!minorDec.isInteger()) {
    throw new Error(`Value ${dec.toString()} does not resolve to integer minor units`);
  }
  return { minor: BigInt(minorDec.toFixed(0)), currency };
}

export function toDecimalMajor(m: Money): Decimal {
  return new Decimal(m.minor.toString()).dividedBy(
    new Decimal(scaleFactor(m.currency).toString()),
  );
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor + b.minor, currency: a.currency };
}

export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor - b.minor, currency: a.currency };
}

export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  let total = 0n;
  for (const item of items) {
    if (item.currency !== currency) {
      throw new Error(`Currency mismatch in sum: ${item.currency} vs ${currency}`);
    }
    total += item.minor;
  }
  return { minor: total, currency };
}

// Format minor units as a display string with explicit currency code.
// IDR shows 0 fraction digits; everything else shows its scale. Uses a true
// minus sign (U+2212) for negatives and groups thousands.
export function formatMinor(minor: bigint, currency: CurrencyCode): string {
  const scale = CURRENCY_SCALE[currency];
  const displayFrac = currency === "IDR" ? 0 : scale;
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const factor = 10n ** BigInt(scale);
  const whole = abs / factor;
  const frac = abs % factor;

  const wholeStr = groupThousands(whole.toString());
  let numStr = wholeStr;
  if (displayFrac > 0) {
    // frac is in `scale` digits; render `displayFrac` of them.
    const fracStr = frac.toString().padStart(scale, "0").slice(0, displayFrac);
    numStr = `${wholeStr}.${fracStr}`;
  }
  const sign = negative ? "−" : "";
  return `${currency} ${sign}${numStr}`;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
