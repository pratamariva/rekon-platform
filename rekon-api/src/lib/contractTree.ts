import type { DbClient, TxClient } from "../db.js";
import type { ContractDef, TreeContext } from "./contracts.js";

export interface AssignmentMaps {
  releaseContract: Map<string, string>;
  trackContract: Map<string, string>;
  itemContract: Map<string, string>;
  transactionContract: Map<string, string>;
  itemLink: Map<string, { trackId: string | null; releaseId: string | null }>;
  trackRelease: Map<string, string>;
  contractDefs: Map<string, ContractDef>;
}

// Load all contract-tree assignment data for a tenant into in-memory maps, plus the
// resolved ContractDef (splits) for every contract. One batch load keeps the per-line
// resolution in statements.issue / reconciliation.allocate cheap.
// HARDEN: at catalog scale, scope the load to the statement's items/tracks/releases
// instead of the whole tenant.
export async function loadAssignmentMaps(
  db: DbClient | TxClient,
  tenantId: string,
): Promise<AssignmentMaps> {
  const [assignments, items, tracks, contracts] = await Promise.all([
    db.contractAssignment.findMany({ where: { tenantId } }),
    db.item.findMany({
      where: { tenantId },
      select: { id: true, trackId: true, releaseId: true },
    }),
    db.track.findMany({
      where: { release: { tenantId } },
      select: { id: true, releaseId: true },
    }),
    db.contract.findMany({
      where: { tenantId },
      include: { splits: true },
    }),
  ]);

  const maps: AssignmentMaps = {
    releaseContract: new Map(),
    trackContract: new Map(),
    itemContract: new Map(),
    transactionContract: new Map(),
    itemLink: new Map(),
    trackRelease: new Map(),
    contractDefs: new Map(),
  };

  for (const a of assignments) {
    if (a.releaseId) maps.releaseContract.set(a.releaseId, a.contractId);
    if (a.trackId) maps.trackContract.set(a.trackId, a.contractId);
    if (a.itemId) maps.itemContract.set(a.itemId, a.contractId);
    if (a.transactionId) maps.transactionContract.set(a.transactionId, a.contractId);
  }
  for (const it of items) {
    maps.itemLink.set(it.id, { trackId: it.trackId, releaseId: it.releaseId });
  }
  for (const t of tracks) {
    maps.trackRelease.set(t.id, t.releaseId);
  }
  for (const c of contracts) {
    maps.contractDefs.set(c.id, {
      splits: c.splits.map((s) => ({
        payeeId: s.payeeId,
        shareBp: s.shareBp,
        ledgerId: s.ledgerId,
      })),
    });
  }
  return maps;
}

export interface TreeTarget {
  itemId?: string | null;
  trackId?: string | null;
  releaseId?: string | null;
  transactionId?: string | null;
}

// Build the nearest-first TreeContext for a statement line / transaction, walking
// item → track → release links so a contract assigned anywhere up the tree is found.
export function treeContextFor(target: TreeTarget, maps: AssignmentMaps): TreeContext {
  let trackId = target.trackId ?? null;
  let releaseId = target.releaseId ?? null;

  if (target.itemId) {
    const link = maps.itemLink.get(target.itemId);
    if (link) {
      trackId = trackId ?? link.trackId;
      releaseId = releaseId ?? link.releaseId;
    }
  }
  if (trackId && !releaseId) {
    releaseId = maps.trackRelease.get(trackId) ?? null;
  }

  return {
    transactionContractId: target.transactionId
      ? (maps.transactionContract.get(target.transactionId) ?? null)
      : null,
    itemContractId: target.itemId ? (maps.itemContract.get(target.itemId) ?? null) : null,
    trackContractId: trackId ? (maps.trackContract.get(trackId) ?? null) : null,
    releaseContractId: releaseId ? (maps.releaseContract.get(releaseId) ?? null) : null,
  };
}
