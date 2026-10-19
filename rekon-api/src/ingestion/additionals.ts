import { isCurrencyCode, type CurrencyCode } from "../lib/money.js";
import { parseCsv, parseMoneyCell } from "./csv.js";
import type { RejectedRow } from "./types.js";

export interface AdditionalLine {
  type: "income" | "expense";
  currency: CurrencyCode;
  amountMinor: bigint; // positive
  memo?: string;
  releaseId?: string;
  trackId?: string;
  itemId?: string;
  payeeId?: string;
  ledgerId?: string;
  direction: "income" | "expense";
}

export interface AdditionalsResult {
  lines: AdditionalLine[];
  rejected: RejectedRow[];
}

// Parse a bulk "Additionals" CSV of manual income/expense entries. Columns:
// type, currency, amount, memo, releaseId, trackId, itemId, payeeId, ledgerId, direction.
export function parseAdditionalsCsv(text: string): AdditionalsResult {
  const rows = parseCsv(text, ",");
  if (rows.length === 0) return { lines: [], rejected: [] };
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name);

  const ci = {
    type: col("type"),
    currency: col("currency"),
    amount: col("amount"),
    memo: col("memo"),
    releaseId: col("releaseid"),
    trackId: col("trackid"),
    itemId: col("itemid"),
    payeeId: col("payeeid"),
    ledgerId: col("ledgerid"),
    direction: col("direction"),
  };

  const lines: AdditionalLine[] = [];
  const rejected: RejectedRow[] = [];

  rows.slice(1).forEach((row, n) => {
    const rowNumber = n + 1;
    const raw: Record<string, string> = {};
    header.forEach((h, i) => (raw[h] = row[i] ?? ""));
    if (row.every((c) => c.trim() === "")) return;

    const get = (i: number): string => (i === -1 ? "" : (row[i] ?? "").trim());
    const direction = (get(ci.direction) || get(ci.type)).toLowerCase();
    if (direction !== "income" && direction !== "expense") {
      rejected.push({ rowNumber, reason: `Invalid direction "${direction}"`, raw });
      return;
    }
    const cur = get(ci.currency).toUpperCase();
    if (!isCurrencyCode(cur)) {
      rejected.push({ rowNumber, reason: `Unsupported currency "${cur}"`, raw });
      return;
    }
    try {
      const { minor } = parseMoneyCell(get(ci.amount), { decimal: ".", currency: cur });
      if (minor <= 0n) {
        rejected.push({ rowNumber, reason: "Amount must be positive", raw });
        return;
      }
      const line: AdditionalLine = {
        type: direction,
        direction,
        currency: cur,
        amountMinor: minor,
      };
      const memo = get(ci.memo);
      const releaseId = get(ci.releaseId);
      const trackId = get(ci.trackId);
      const itemId = get(ci.itemId);
      const payeeId = get(ci.payeeId);
      const ledgerId = get(ci.ledgerId);
      if (memo) line.memo = memo;
      if (releaseId) line.releaseId = releaseId;
      if (trackId) line.trackId = trackId;
      if (itemId) line.itemId = itemId;
      if (payeeId) line.payeeId = payeeId;
      if (ledgerId) line.ledgerId = ledgerId;
      lines.push(line);
    } catch (err) {
      rejected.push({
        rowNumber,
        reason: err instanceof Error ? err.message : "Unparseable row",
        raw,
      });
    }
  });

  return { lines, rejected };
}
