import type { CurrencyCode } from "./money.js";
import { payableFromLedgers } from "./contracts.js";

export interface LedgerBalance {
  ledgerId: string | null;
  currency: CurrencyCode;
  amountMinor: bigint;
}

export interface DrawdownDebit {
  ledgerId: string | null;
  currency: CurrencyCode;
  amountMinor: bigint; // negative = debit
}

// Draw `amountMinor` out of a payee's ledger balances. Takes from the largest
// POSITIVE balance first (tiebreak by ledger id for determinism), never touches
// negative/advance ledgers, and throws if the amount exceeds the payable (sum of
// positive balances). The produced debits sum to EXACTLY -amountMinor.
export function drawDownLedgers(
  balances: readonly LedgerBalance[],
  amountMinor: bigint,
): DrawdownDebit[] {
  if (amountMinor < 0n) {
    throw new Error("drawDownLedgers requires a non-negative amount");
  }
  const payable = payableFromLedgers(balances);
  if (amountMinor > payable) {
    throw new Error(
      `Payout ${amountMinor} exceeds payable ${payable} (positive ledger balances)`,
    );
  }

  const positives = balances
    .filter((b) => b.amountMinor > 0n)
    .sort((a, b) => {
      if (a.amountMinor !== b.amountMinor) return a.amountMinor > b.amountMinor ? -1 : 1;
      const aKey = a.ledgerId ?? "";
      const bKey = b.ledgerId ?? "";
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    });

  const debits: DrawdownDebit[] = [];
  let remaining = amountMinor;
  for (const bal of positives) {
    if (remaining === 0n) break;
    const take = bal.amountMinor < remaining ? bal.amountMinor : remaining;
    debits.push({ ledgerId: bal.ledgerId, currency: bal.currency, amountMinor: -take });
    remaining -= take;
  }

  if (remaining !== 0n) {
    // Unreachable given the payable check above; defensive assertion.
    throw new Error(`Drawdown did not tie: ${remaining} left over`);
  }
  return debits;
}

// Total already paid from a set of payout postings (debits are negative, so paid is
// the negated sum).
export function alreadyPaid(postings: readonly { amountMinor: bigint }[]): bigint {
  let total = 0n;
  for (const p of postings) total += p.amountMinor;
  return -total;
}
