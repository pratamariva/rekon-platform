import type { TxClient } from "../db.js";
import { prisma } from "../db.js";

// Append-only audit log with bilingual messages (English + Bahasa Indonesia).
// HARDEN: enforce append-only at the DB layer (no UPDATE/DELETE), and consider a
// tamper-evident hash chain for regulated deployments.

export type AuditAction =
  | "statement.imported"
  | "statement.issued"
  | "split.edited"
  | "contract.upserted"
  | "remittance.allocated"
  | "payout.sent"
  | "payout.proof_attached"
  | "payee.created"
  | "transaction.created"
  | "transaction.reversed";

type Template = (p: Record<string, string>) => string;

const TEMPLATES: Record<AuditAction, { en: Template; id: Template }> = {
  "statement.imported": {
    en: (p) => `Imported statement "${p.title}" (${p.lines} lines)`,
    id: (p) => `Mengimpor laporan "${p.title}" (${p.lines} baris)`,
  },
  "statement.issued": {
    en: (p) => `Issued statement "${p.title}" with ${p.participants} participants`,
    id: (p) => `Menerbitkan laporan "${p.title}" dengan ${p.participants} penerima`,
  },
  "split.edited": {
    en: (p) => `Edited split for "${p.name}"`,
    id: (p) => `Mengubah pembagian untuk "${p.name}"`,
  },
  "contract.upserted": {
    en: (p) => `Saved contract "${p.name}"`,
    id: (p) => `Menyimpan kontrak "${p.name}"`,
  },
  "remittance.allocated": {
    en: (p) => `Allocated ${p.amount} across ${p.lines} statement lines`,
    id: (p) => `Mengalokasikan ${p.amount} ke ${p.lines} baris laporan`,
  },
  "payout.sent": {
    en: (p) => `Sent payout ${p.amount} to ${p.payee}`,
    id: (p) => `Mengirim pembayaran ${p.amount} kepada ${p.payee}`,
  },
  "payout.proof_attached": {
    en: (p) => `Attached payment proof to payout for ${p.payee}`,
    id: (p) => `Melampirkan bukti pembayaran untuk ${p.payee}`,
  },
  "payee.created": {
    en: (p) => `Created payee "${p.name}"`,
    id: (p) => `Membuat penerima "${p.name}"`,
  },
  "transaction.created": {
    en: (p) => `Recorded ${p.type} transaction ${p.amount}`,
    id: (p) => `Mencatat transaksi ${p.type} ${p.amount}`,
  },
  "transaction.reversed": {
    en: (p) => `Reversed transaction ${p.id} (${p.reason})`,
    id: (p) => `Membalik transaksi ${p.id} (${p.reason})`,
  },
};

export interface WriteAuditInput {
  tenantId: string;
  actorId: string;
  action: AuditAction;
  recordId: string;
  params?: Record<string, string>;
}

export async function writeAudit(
  db: TxClient | typeof prisma,
  input: WriteAuditInput,
): Promise<void> {
  const tpl = TEMPLATES[input.action];
  const params = input.params ?? {};
  await db.auditEntry.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: input.action,
      recordId: input.recordId,
      messageEn: tpl.en(params),
      messageId: tpl.id(params),
    },
  });
}
