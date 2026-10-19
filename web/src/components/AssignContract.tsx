import { useState } from "react";
import { trpc } from "../trpc.js";

type Level = "release" | "track" | "item" | "transaction";

interface Props {
  level: Level;
  targetId: string;
  onAssigned?: () => void;
}

// Assign a contract at a given tree level. Non-release levels offer "Inherit from
// above" (no override at this level → the tree resolves to the nearest ancestor).
export function AssignContract({ level, targetId, onAssigned }: Props) {
  const contracts = trpc.contracts.list.useQuery();
  const utils = trpc.useUtils();
  const assign = trpc.contracts.assign.useMutation({
    onSuccess: async () => {
      await utils.contracts.list.invalidate();
      await utils.catalog.invalidate();
      onAssigned?.();
    },
  });
  const [contractId, setContractId] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`assign-${targetId}`}>
        Assign contract
      </label>
      <select
        id={`assign-${targetId}`}
        value={contractId}
        onChange={(e) => setContractId(e.target.value)}
        className="rounded border border-border bg-surface px-2 py-1 text-sm"
      >
        <option value="">
          {level === "release" ? "Select a contract…" : "Inherit from above"}
        </option>
        {contracts.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        disabled={!contractId || assign.isPending}
        onClick={() =>
          assign.mutate({
            level,
            contractId,
            ...(level === "release"
              ? { releaseId: targetId }
              : level === "track"
                ? { trackId: targetId }
                : level === "item"
                  ? { itemId: targetId }
                  : { transactionId: targetId }),
          })
        }
        className="rounded bg-brand px-3 py-1 text-sm text-brand-contrast disabled:opacity-50"
      >
        {assign.isPending ? "Assigning…" : "Assign"}
      </button>
    </div>
  );
}
