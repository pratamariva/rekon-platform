import type { CurrencyCode } from "./money.js";
import { allocateRealizedCash } from "./reconciliation.js";

// The label's share is the IMPLICIT remainder of 100% (10000 bp). It is never a
// stored ContractSplit row — it is computed as 10000 minus the sum of payee shares.
// We tag label postings with this sentinel payee id so the largest-remainder
// allocation ties to the total EXACTLY; balances.ts skips label postings when
// applying to PayeeBalance.
export const LABEL_PAYEE = "__LABEL__";

// A null ledger id means the payee's Primary (crossed) ledger.
export const PRIMARY_LEDGER = null;

export const BASIS_POINTS_FULL = 10000;

export interface ContractSplitDef {
  payeeId: string;
  shareBp: number;
  ledgerId?: string | null;
}

export interface ContractDef {
  splits: ContractSplitDef[];
}

export interface LedgerPosting {
  payeeId: string;
  ledgerId: string | null;
  currency: CurrencyCode;
  amountMinor: bigint;
}

// Nearest-first resolution context. Each field is the contract id assigned at that
// level of the tree (if any). resolveContractId picks the nearest non-null.
export interface TreeContext {
  transactionContractId?: string | null;
  itemContractId?: string | null;
  trackContractId?: string | null;
  releaseContractId?: string | null;
}

// Validate that payee shares do not exceed 100%. The remainder (if any) is the
// implicit label share, so equality or less is valid; more is not.
export function validateContract(def: ContractDef): void {
  let total = 0;
  for (const split of def.splits) {
    if (split.shareBp < 0 || split.shareBp > BASIS_POINTS_FULL) {
      throw new Error(`Split share ${split.shareBp}bp out of range 0..10000`);
    }
    total += split.shareBp;
  }
  if (total > BASIS_POINTS_FULL) {
    throw new Error(`Contract payee shares total ${total}bp exceed 10000bp (100%)`);
  }
}

// Nearest-first: transaction → item → track → release. Returns null when nothing is
// assigned anywhere up the tree, meaning 100% label.
export function resolveContractId(ctx: TreeContext): string | null {
  return (
    ctx.transactionContractId ??
    ctx.itemContractId ??
    ctx.trackContractId ??
    ctx.releaseContractId ??
    null
  );
}

// Apply a contract to a realized cash amount, producing ledger postings. The label
// remainder is included as a posting (tagged LABEL_PAYEE) so that the parts sum to
// EXACTLY realizedMinor. A null contract means 100% label.
export function applyContract(
  realizedMinor: bigint,
  currency: CurrencyCode,
  def: ContractDef | null,
): LedgerPosting[] {
  const splits = def?.splits ?? [];
  validateContract({ splits });

  const payeeShare = splits.reduce((acc, s) => acc + s.shareBp, 0);
  const labelShareBp = BASIS_POINTS_FULL - payeeShare;

  // Build allocation lines; the label remainder is line "__label__". Deterministic
  // ids (zero-padded index) keep the largest-remainder tiebreak stable.
  interface Target {
    payeeId: string;
    ledgerId: string | null;
  }
  const targets = new Map<string, Target>();
  const lines = splits.map((s, idx) => {
    const id = `split-${String(idx).padStart(4, "0")}`;
    targets.set(id, { payeeId: s.payeeId, ledgerId: s.ledgerId ?? PRIMARY_LEDGER });
    return { id, referenceValueMinor: BigInt(s.shareBp) };
  });
  if (labelShareBp > 0) {
    const id = "zzz-label";
    targets.set(id, { payeeId: LABEL_PAYEE, ledgerId: PRIMARY_LEDGER });
    lines.push({ id, referenceValueMinor: BigInt(labelShareBp) });
  }

  const allocated = allocateRealizedCash(realizedMinor, currency, lines);

  const postings = allocated.map((a) => {
    const target = targets.get(a.id);
    if (target === undefined) {
      throw new Error(`Allocation target missing for ${a.id}`);
    }
    return {
      payeeId: target.payeeId,
      ledgerId: target.ledgerId,
      currency,
      amountMinor: a.allocatedMinor,
    };
  });

  // Assert exact tie back to the realized total.
  const totalPosted = postings.reduce((acc, p) => acc + p.amountMinor, 0n);
  if (totalPosted !== realizedMinor) {
    throw new Error(
      `applyContract did not tie: posted ${totalPosted} vs realized ${realizedMinor}`,
    );
  }
  return postings;
}

// Combine postings that share (payeeId, ledgerId, currency), summing amounts. Used
// for netting and for building compensating reversals.
export function netPostings(postings: readonly LedgerPosting[]): LedgerPosting[] {
  const map = new Map<string, LedgerPosting>();
  for (const p of postings) {
    const key = `${p.payeeId}|${p.ledgerId ?? ""}|${p.currency}`;
    const existing = map.get(key);
    if (existing === undefined) {
      map.set(key, { ...p });
    } else {
      existing.amountMinor += p.amountMinor;
    }
  }
  return [...map.values()];
}

// Payable = sum of POSITIVE ledger balances only. Negative (advance) ledgers hold
// back only themselves; they do not reduce the payable from positive ledgers.
export function payableFromLedgers(balances: readonly { amountMinor: bigint }[]): bigint {
  let total = 0n;
  for (const b of balances) {
    if (b.amountMinor > 0n) total += b.amountMinor;
  }
  return total;
}
