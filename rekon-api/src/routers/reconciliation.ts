import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure, assertTenant } from "../trpc.js";
import { allocateRealizedCash } from "../lib/reconciliation.js";
import { applyContract, resolveContractId } from "../lib/contracts.js";
import { applyPostingsToBalances } from "../lib/balances.js";
import { loadAssignmentMaps, treeContextFor } from "../lib/contractTree.js";
import { formatMinor, CURRENCY_CODES, type CurrencyCode } from "../lib/money.js";
import { writeAudit } from "../audit/log.js";

const currencyEnum = z.enum(CURRENCY_CODES as unknown as [string, ...string[]]);

export const reconciliationRouter = router({
  recordRemittance: tenantProcedure
    .input(
      z.object({
        statementId: z.string().optional(),
        receivedCurrency: currencyEnum,
        receivedAmountMinor: z.bigint().positive(),
        paymentReference: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.statementId) {
        const s = await ctx.prisma.statement.findUnique({
          where: { id: input.statementId },
        });
        if (!s) throw new TRPCError({ code: "NOT_FOUND" });
        assertTenant(s.tenantId, ctx.user.tenantId);
      }
      return ctx.prisma.remittance.create({
        data: {
          statementId: input.statementId ?? null,
          receivedCurrency: input.receivedCurrency as CurrencyCode,
          receivedAmountMinor: input.receivedAmountMinor,
          paymentReference: input.paymentReference ?? null,
        },
      });
    }),

  // Allocate a remittance across its statement's lines by largest remainder (weighted
  // by accrued native amount), book realized amounts + confirmed status, and post each
  // line's contract to the payee ledgers.
  allocate: tenantProcedure
    .input(z.object({ remittanceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const remittance = await ctx.prisma.remittance.findUnique({
        where: { id: input.remittanceId },
        include: { statement: { include: { lines: true } } },
      });
      if (!remittance || !remittance.statement) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Remittance or statement missing" });
      }
      assertTenant(remittance.statement.tenantId, ctx.user.tenantId);

      const lines = remittance.statement.lines;
      if (lines.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Statement has no lines" });
      }

      // HARDEN: mixed-currency statements need per-currency allocation + FX netting.
      // We reject them here rather than allocate incorrectly.
      const currencies = new Set(lines.map((l) => l.nativeCurrency));
      if (currencies.size > 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Mixed-currency statement allocation is not supported (HARDEN).",
        });
      }

      const cashCurrency = remittance.receivedCurrency;
      const allocation = allocateRealizedCash(
        remittance.receivedAmountMinor,
        cashCurrency,
        lines.map((l) => ({ id: l.id, referenceValueMinor: l.nativeAmountMinor })),
      );
      const allocById = new Map(allocation.map((a) => [a.id, a.allocatedMinor]));

      const maps = await loadAssignmentMaps(ctx.prisma, ctx.user.tenantId);

      await ctx.prisma.$transaction(async (tx) => {
        for (const line of lines) {
          const realized = allocById.get(line.id) ?? 0n;
          await tx.statementLine.update({
            where: { id: line.id },
            data: { realizedMinor: realized, reconStatus: "confirmed" },
          });
          await tx.reconAllocation.create({
            data: {
              remittanceId: remittance.id,
              statementLineId: line.id,
              allocatedMinor: realized,
              tier: "deterministic",
            },
          });

          // Prefer the frozen resolvedContractId; fall back to live tree resolution.
          const contractId =
            line.resolvedContractId ??
            resolveContractId(
              treeContextFor({ itemId: line.itemId, trackId: line.trackId }, maps),
            );
          const def = contractId ? (maps.contractDefs.get(contractId) ?? null) : null;
          const postings = applyContract(realized, cashCurrency, def);
          await applyPostingsToBalances(tx, cashCurrency, postings);
        }

        await writeAudit(tx, {
          tenantId: ctx.user.tenantId,
          actorId: ctx.user.id,
          action: "remittance.allocated",
          recordId: remittance.id,
          params: {
            amount: formatMinor(remittance.receivedAmountMinor, cashCurrency),
            lines: String(lines.length),
          },
        });
      });

      return { ok: true, allocatedLines: lines.length };
    }),

  exceptions: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prisma.exception.findMany({
      where: { tenantId: ctx.user.tenantId, resolved: false },
      orderBy: { createdAt: "desc" },
    });
  }),

  resolveException: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const ex = await ctx.prisma.exception.findUnique({ where: { id: input.id } });
      if (!ex) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(ex.tenantId, ctx.user.tenantId);
      return ctx.prisma.exception.update({
        where: { id: input.id },
        data: { resolved: true },
      });
    }),
});
