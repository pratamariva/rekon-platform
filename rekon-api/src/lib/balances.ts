import type { TxClient } from "../db.js";
import type { CurrencyCode, Money } from "./money.js";
import { LABEL_PAYEE, type LedgerPosting } from "./contracts.js";

// Apply ledger postings to PayeeBalance rows inside a transaction. Label postings
// (payeeId === LABEL_PAYEE) are skipped — the label share is the implicit remainder
// and is never a stored balance row. The compound unique is (payeeId, ledgerId,
// currency) with a nullable ledgerId, so we find-then-update/create explicitly
// (Prisma upsert on a nullable compound unique is unreliable).
export async function applyPostingsToBalances(
  tx: TxClient,
  currency: CurrencyCode,
  postings: readonly LedgerPosting[],
): Promise<void> {
  for (const p of postings) {
    if (p.payeeId === LABEL_PAYEE) continue;
    if (p.currency !== currency) {
      throw new Error(`Posting currency ${p.currency} != ledger currency ${currency}`);
    }
    const existing = await tx.payeeBalance.findFirst({
      where: { payeeId: p.payeeId, ledgerId: p.ledgerId, currency },
    });
    if (existing) {
      await tx.payeeBalance.update({
        where: { id: existing.id },
        data: { amountMinor: existing.amountMinor + p.amountMinor },
      });
    } else {
      await tx.payeeBalance.create({
        data: {
          payeeId: p.payeeId,
          ledgerId: p.ledgerId,
          currency,
          amountMinor: p.amountMinor,
        },
      });
    }
  }
}

// Convenience: express a balance row as Money.
export function balanceToMoney(amountMinor: bigint, currency: CurrencyCode): Money {
  return { minor: amountMinor, currency };
}
