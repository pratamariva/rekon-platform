import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure, assertTenant } from "../trpc.js";
import { loadAssignmentMaps, treeContextFor } from "../lib/contractTree.js";
import { applyContract, resolveContractId, LABEL_PAYEE } from "../lib/contracts.js";
import type { CurrencyCode } from "../lib/money.js";
import { writeAudit } from "../audit/log.js";

export const statementsRouter = router({
  list: tenantProcedure
    .input(
      z
        .object({
          q: z.string().optional(),
          status: z.enum(["draft", "issued", "disputed"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const statements = await ctx.prisma.statement.findMany({
        where: {
          tenantId: ctx.user.tenantId,
          status: input?.status,
          title: input?.q ? { contains: input.q, mode: "insensitive" } : undefined,
        },
        include: { lines: true },
        orderBy: { createdAt: "desc" },
      });
      return statements.map((s) => {
        const netByCurrency = new Map<CurrencyCode, bigint>();
        let realizedFunctionalMinor = 0n;
        for (const line of s.lines) {
          netByCurrency.set(
            line.nativeCurrency,
            (netByCurrency.get(line.nativeCurrency) ?? 0n) + line.nativeAmountMinor,
          );
          if (line.realizedMinor !== null) realizedFunctionalMinor += line.realizedMinor;
        }
        return {
          id: s.id,
          title: s.title,
          period: s.period,
          status: s.status,
          issuedAt: s.issuedAt,
          lineCount: s.lines.length,
          netByCurrency: [...netByCurrency.entries()].map(([currency, totalMinor]) => ({
            currency,
            totalMinor,
          })),
          realizedFunctionalMinor,
        };
      });
    }),

  detail: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const statement = await ctx.prisma.statement.findUnique({
        where: { id: input.id },
        include: {
          lines: { include: { track: true, item: true } },
          participants: { include: { payee: true } },
        },
      });
      if (!statement) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(statement.tenantId, ctx.user.tenantId);
      return statement;
    }),

  // Freeze the statement: resolve and store each line's contract via the tree, compute
  // and persist per-payee participant shares (in functional currency) from realized
  // amounts, and mark it issued. The frozen rows are what the payee portal filters on.
  issue: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const statement = await ctx.prisma.statement.findUnique({
        where: { id: input.id },
        include: { lines: true },
      });
      if (!statement) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(statement.tenantId, ctx.user.tenantId);
      if (statement.status === "issued") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already issued" });
      }

      const tenant = await ctx.prisma.tenant.findUniqueOrThrow({
        where: { id: ctx.user.tenantId },
      });
      const functional = tenant.functionalCurrency;
      const maps = await loadAssignmentMaps(ctx.prisma, ctx.user.tenantId);

      const participantTotals = new Map<string, bigint>();

      await ctx.prisma.$transaction(async (tx) => {
        for (const line of statement.lines) {
          const treeCtx = treeContextFor(
            { itemId: line.itemId, trackId: line.trackId },
            maps,
          );
          const contractId = resolveContractId(treeCtx);
          await tx.statementLine.update({
            where: { id: line.id },
            data: { resolvedContractId: contractId },
          });

          // Freeze participant shares from the realized functional amount.
          if (line.realizedMinor !== null) {
            const def = contractId ? (maps.contractDefs.get(contractId) ?? null) : null;
            const postings = applyContract(line.realizedMinor, functional, def);
            for (const p of postings) {
              if (p.payeeId === LABEL_PAYEE) continue;
              participantTotals.set(
                p.payeeId,
                (participantTotals.get(p.payeeId) ?? 0n) + p.amountMinor,
              );
            }
          }
        }

        // Replace participant rows (idempotent re-issue is blocked above, but be safe).
        await tx.statementParticipant.deleteMany({ where: { statementId: statement.id } });
        for (const [payeeId, shareFunctionalMinor] of participantTotals) {
          await tx.statementParticipant.create({
            data: { statementId: statement.id, payeeId, shareFunctionalMinor },
          });
        }

        await tx.statement.update({
          where: { id: statement.id },
          data: { status: "issued", issuedAt: new Date() },
        });

        await writeAudit(tx, {
          tenantId: ctx.user.tenantId,
          actorId: ctx.user.id,
          action: "statement.issued",
          recordId: statement.id,
          params: { title: statement.title, participants: String(participantTotals.size) },
        });
      });

      return { ok: true, participants: participantTotals.size };
    }),
});
