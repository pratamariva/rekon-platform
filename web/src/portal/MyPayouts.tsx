import { useState } from "react";
import { trpc } from "../trpc.js";
import { Money } from "../components/Money.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { Lightbox } from "../components/Lightbox.js";

export function MyPayouts() {
  const payouts = trpc.payeePortal.myPayouts.useQuery();
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">My payouts</h1>
      <ul className="space-y-2">
        {payouts.data?.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded border border-border bg-surface p-3 text-sm"
          >
            <div className="flex items-center gap-3">
              <StatusBadge status={p.status === "paid" ? "confirmed" : "provisional"} />
              <span>{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : p.status}</span>
            </div>
            <div className="flex items-center gap-3">
              <Money minor={p.payoutAmountMinor} currency={p.payoutCurrency} />
              {p.proofUrl && (
                <button
                  className="rounded border border-border px-2 py-1 text-xs"
                  onClick={() => setPreview({ url: p.proofUrl!, name: `receipt-${p.id}` })}
                >
                  Receipt
                </button>
              )}
            </div>
          </li>
        ))}
        {payouts.data?.length === 0 && <li className="text-text-subtle">No payouts yet.</li>}
      </ul>
      {preview && (
        <Lightbox
          url={preview.url}
          name={preview.name}
          kind={preview.url.startsWith("data:application/pdf") ? "pdf" : "image"}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
