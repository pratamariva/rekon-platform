import { formatMinor } from "../lib/money.js";
import type { CurrencyCode } from "../types.js";

interface Props {
  minor: bigint;
  currency: CurrencyCode;
  // "cash" = realized/settled (strong). "estimate" = accrued/not-yet-realized
  // (muted, dotted underline, labelled "est.") so the two are never confused.
  basis?: "cash" | "estimate";
}

export function Money({ minor, currency, basis = "cash" }: Props) {
  const text = formatMinor(minor, currency);
  if (basis === "estimate") {
    return (
      <span
        className="tabular text-accrued"
        style={{ textDecoration: "underline dotted" }}
        title="Estimate — not yet realized"
      >
        {text} <span className="text-xs">est.</span>
      </span>
    );
  }
  return <span className="tabular font-medium text-realized">{text}</span>;
}
