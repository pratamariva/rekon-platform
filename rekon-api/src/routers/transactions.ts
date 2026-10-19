import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure, assertTenant, type Context } from "../trpc.js";
import { applyContract, resolveContractId, type LedgerPosting } from "../lib/contracts.js";
import { applyPostingsToBalances } from "../lib/balances.js";
import { loadAssignmentMaps, treeContextFor } from "../lib/contractTree.js";
import { CURRENCY_CODES, formatMinor, type CurrencyCode } from "../lib/money.js";
import { parseAdditionalsCsv, type AdditionalLine } from "../ingestion/additionals.js";
import { writeAudit } from "../audit/log.js";

const currencyEnum = z.enum(CURRENCY_CODES as unknown as [string, ...string[]]);

type Ctx = Context & { user: { tenantId: string; id: string } };

// Create an income/expense transaction resolved through the contract tree. Income
// distributes positive postings to payee ledgers; expense flips the sign so it recoups
// against (drives negative) those ledgers.
async function createIncomeOrExpenseCore(
  ctx: Ctx,
  input: {
    type: "income" | "expense";
    currency: CurrencyCode;
    amountMinor: bigint;
    occurredAt?: Date;
    memo?: string;
    releaseId?: string;
    trackId?: string;
    itemId?: string;
  },
) {
  const maps = await loadAssignmentMaps(ctx.prisma, ctx.user.tenantId);
  const treeCtx = treeContextFor(
    { itemId: input.itemId, trackId: input.trackId, releaseId: input.releaseId },
    maps,
  );
  const contractId = resolveContractId(treeCtx);
  const def = contractId ? (maps.contractDefs.get(contractId) ?? null) : null;

  const base = applyContract(input.amountMinor, input.currency, def);
  const sign = input.type === "expense" ? -1n : 1n;
  const postings: LedgerPosting[] = base.map((p) => ({
    ...p,
    amountMinor: p.amountMinor * sign,
  }));

  return ctx.prisma.$transaction(async (tx) => {
    const txn = await tx.manualTransaction.create({
      data: {
        tenantId: ctx.user.tenantId,
        type: input.type,
        currency: input.currency,
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt ?? new Date(),
        memo: input.memo ?? null,
        releaseId: input.releaseId ?? null,
        trackId: input.trackId ?? null,
        itemId: input.itemId ?? null,
      },
    });
    for (const p of postings) {
      // Skip label postings in TxnPosting too — the label remainder is implicit.
      if (p.payeeId === "__LABEL__") continue;
      await tx.txnPosting.create({
        data: {
          transactionId: txn.id,
          payeeId: p.payeeId,
          ledgerId: p.ledgerId,
          currency: p.currency,
          amountMinor: p.amountMinor,
        },
      });
    }
    await applyPostingsToBalances(tx, input.currency, postings);
    await writeAudit(tx, {
      tenantId: ctx.user.tenantId,
      actorId: ctx.user.id,
      action: "transaction.created",
      recordId: txn.id,
      params: { type: input.type, amount: formatMinor(input.amountMinor, input.currency) },
    });
    return txn;
  });
}

async function createTransferCore(
  ctx: Ctx,
  input: {
    payeeId: string;
    ledgerId?: string | null;
    currency: CurrencyCode;
    amountMinor: bigint;
    direction: "income" | "expense";
    memo?: string;
    occurredAt?: Date;
  },
) {
  const payee = await ctx.prisma.payee.findUnique({ where: { id: input.payeeId } });
  if (!payee) throw new TRPCError({ code: "NOT_FOUND" });
  assertTenant(payee.tenantId, ctx.user.tenantId);

  const sign = input.direction === "expense" ? -1n : 1n;
  const posting: LedgerPosting = {
    payeeId: input.payeeId,
    ledgerId: input.ledgerId ?? null,
    currency: input.currency,
    amountMinor: input.amountMinor * sign,
  };

  return ctx.prisma.$transaction(async (tx) => {
    const txn = await tx.manualTransaction.create({
      data: {
        tenantId: ctx.user.tenantId,
        type: "transfer",
        currency: input.currency,
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt ?? new Date(),
        memo: input.memo ?? null,
        payeeId: input.payeeId,
        ledgerId: input.ledgerId ?? null,
      },
    });
    await tx.txnPosting.create({
      data: {
        transactionId: txn.id,
        payeeId: posting.payeeId,
        ledgerId: posting.ledgerId,
        currency: posting.currency,
        amountMinor: posting.amountMinor,
      },
    });
    await applyPostingsToBalances(tx, input.currency, [posting]);
    await writeAudit(tx, {
      tenantId: ctx.user.tenantId,
      actorId: ctx.user.id,
      action: "transaction.created",
      recordId: txn.id,
      params: { type: "transfer", amount: formatMinor(input.amountMinor, input.currency) },
    });
    return txn;
  });
}

export const transactionsRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prisma.manualTransaction.findMany({
      where: { tenantId: ctx.user.tenantId },
      include: { postings: true, payee: true },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
  }),

  createIncomeOrExpense: tenantProcedure
    .input(
      z.object({
        type: z.enum(["income", "expense"]),
        currency: currencyEnum,
        amountMinor: z.bigint().positive(),
        occurredAt: z.date().optional(),
        memo: z.string().optional(),
        releaseId: z.string().optional(),
        trackId: z.string().optional(),
        itemId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createIncomeOrExpenseCore(ctx as Ctx, {
        ...input,
        currency: input.currency as CurrencyCode,
      });
    }),

  createTransfer: tenantProcedure
    .input(
      z.object({
        payeeId: z.string(),
        ledgerId: z.string().nullable().optional(),
        currency: currencyEnum,
        amountMinor: z.bigint().positive(),
        direction: z.enum(["income", "expense"]),
        memo: z.string().optional(),
        occurredAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createTransferCore(ctx as Ctx, {
        ...input,
        currency: input.currency as CurrencyCode,
      });
    }),

  // Reverse a transaction with compensating inverse postings. We NEVER edit or delete
  // the original — we append a reversal and mark the original voided.
  reverse: tenantProcedure
    .input(z.object({ transactionId: z.string(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const original = await ctx.prisma.manualTransaction.findUnique({
        where: { id: input.transactionId },
        include: { postings: true },
      });
      if (!original) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(original.tenantId, ctx.user.tenantId);
      if (original.voidedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already reversed" });
      }

      return ctx.prisma.$transaction(async (tx) => {
        const reversal = await tx.manualTransaction.create({
          data: {
            tenantId: ctx.user.tenantId,
            type: original.type,
            currency: original.currency,
            amountMinor: original.amountMinor,
            occurredAt: new Date(),
            memo: `Reversal: ${input.reason}`,
            payeeId: original.payeeId,
            ledgerId: original.ledgerId,
            reversesId: original.id,
          },
        });
        const inverse: LedgerPosting[] = original.postings.map((p) => ({
          payeeId: p.payeeId,
          ledgerId: p.ledgerId,
          currency: p.currency,
          amountMinor: -p.amountMinor,
        }));
        for (const p of inverse) {
          await tx.txnPosting.create({
            data: {
              transactionId: reversal.id,
              payeeId: p.payeeId,
              ledgerId: p.ledgerId,
              currency: p.currency,
              amountMinor: p.amountMinor,
            },
          });
        }
        await applyPostingsToBalances(tx, original.currency, inverse);
        await tx.manualTransaction.update({
          where: { id: original.id },
          data: { voidedAt: new Date() },
        });
        await writeAudit(tx, {
          tenantId: ctx.user.tenantId,
          actorId: ctx.user.id,
          action: "transaction.reversed",
          recordId: original.id,
          params: { id: original.id, reason: input.reason },
        });
        return reversal;
      });
    }),

  bulkPreview: tenantProcedure
    .input(z.object({ csv: z.string() }))
    .query(({ input }) => {
      return parseAdditionalsCsv(input.csv);
    }),

  bulkCommit: tenantProcedure
    .input(z.object({ csv: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // RE-PARSE server-side; reuse the single-transaction cores for each row.
      const { lines, rejected } = parseAdditionalsCsv(input.csv);
      let created = 0;
      for (const line of lines as AdditionalLine[]) {
        if (line.payeeId) {
          await createTransferCore(ctx as Ctx, {
            payeeId: line.payeeId,
            ledgerId: line.ledgerId ?? null,
            currency: line.currency,
            amountMinor: line.amountMinor,
            direction: line.direction,
            memo: line.memo,
          });
        } else {
          await createIncomeOrExpenseCore(ctx as Ctx, {
            type: line.direction,
            currency: line.currency,
            amountMinor: line.amountMinor,
            memo: line.memo,
            releaseId: line.releaseId,
            trackId: line.trackId,
            itemId: line.itemId,
          });
        }
        created += 1;
      }
      return { ok: true, created, rejected: rejected.length };
    }),
});
