import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure, assertTenant } from "../trpc.js";
import { validateContract } from "../lib/contracts.js";
import { rollUpReleaseSplit, type TrackSplitInput } from "../lib/splits.js";
import { loadAssignmentMaps } from "../lib/contractTree.js";
import { writeAudit } from "../audit/log.js";

const splitRoleEnum = z.enum([
  "artist",
  "producer",
  "writer",
  "featured",
  "mixer",
  "label",
]);

const contractLevelEnum = z.enum(["release", "track", "item", "transaction"]);

export const contractsRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prisma.contract.findMany({
      where: { tenantId: ctx.user.tenantId },
      include: { splits: { include: { payee: true, ledger: true } } },
      orderBy: { createdAt: "desc" },
    });
  }),

  upsert: tenantProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        documentUrl: z.string().url().optional(),
        splits: z
          .array(
            z.object({
              payeeId: z.string(),
              role: splitRoleEnum,
              shareBp: z.number().int().min(0).max(10000),
              ledgerId: z.string().nullable().optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Reject > 100% before touching the DB.
      validateContract({ splits: input.splits });

      const contract = await ctx.prisma.$transaction(async (tx) => {
        let contractId = input.id;
        if (contractId) {
          const existing = await tx.contract.findUnique({ where: { id: contractId } });
          if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
          assertTenant(existing.tenantId, ctx.user.tenantId);
          await tx.contract.update({
            where: { id: contractId },
            data: { name: input.name, documentUrl: input.documentUrl ?? null },
          });
          await tx.contractSplit.deleteMany({ where: { contractId } });
        } else {
          const created = await tx.contract.create({
            data: {
              tenantId: ctx.user.tenantId,
              name: input.name,
              documentUrl: input.documentUrl ?? null,
            },
          });
          contractId = created.id;
        }
        await tx.contractSplit.createMany({
          data: input.splits.map((s) => ({
            contractId: contractId!,
            payeeId: s.payeeId,
            role: s.role,
            shareBp: s.shareBp,
            ledgerId: s.ledgerId ?? null,
          })),
        });
        await writeAudit(tx, {
          tenantId: ctx.user.tenantId,
          actorId: ctx.user.id,
          action: "contract.upserted",
          recordId: contractId,
          params: { name: input.name },
        });
        return tx.contract.findUniqueOrThrow({
          where: { id: contractId },
          include: { splits: true },
        });
      });
      return contract;
    }),

  assign: tenantProcedure
    .input(
      z.object({
        level: contractLevelEnum,
        contractId: z.string(),
        releaseId: z.string().optional(),
        trackId: z.string().optional(),
        itemId: z.string().optional(),
        transactionId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.prisma.contract.findUnique({
        where: { id: input.contractId },
      });
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(contract.tenantId, ctx.user.tenantId);

      const target =
        input.level === "release"
          ? { releaseId: input.releaseId }
          : input.level === "track"
            ? { trackId: input.trackId }
            : input.level === "item"
              ? { itemId: input.itemId }
              : { transactionId: input.transactionId };
      const targetId = Object.values(target)[0];
      if (!targetId) throw new TRPCError({ code: "BAD_REQUEST", message: "Missing target" });

      // Each target field is @@unique, so one assignment per target. Re-assigning
      // replaces it (the tree resolves nearest-first at read time).
      const whereKey =
        input.level === "release"
          ? { releaseId: targetId }
          : input.level === "track"
            ? { trackId: targetId }
            : input.level === "item"
              ? { itemId: targetId }
              : { transactionId: targetId };

      const existing = await ctx.prisma.contractAssignment.findFirst({
        where: whereKey,
      });
      if (existing) {
        return ctx.prisma.contractAssignment.update({
          where: { id: existing.id },
          data: { contractId: input.contractId, level: input.level },
        });
      }
      return ctx.prisma.contractAssignment.create({
        data: {
          tenantId: ctx.user.tenantId,
          level: input.level,
          contractId: input.contractId,
          ...target,
        },
      });
    }),

  createLedger: tenantProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.ledger.create({
        data: { tenantId: ctx.user.tenantId, name: input.name },
      });
    }),

  listLedgers: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prisma.ledger.findMany({
      where: { tenantId: ctx.user.tenantId },
      orderBy: { name: "asc" },
    });
  }),

  // Recommend a release-level split by rolling up each track's assigned contract,
  // weighting tracks by their confirmed realized revenue. Editable in the UI.
  recommendRelease: tenantProcedure
    .input(z.object({ releaseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const release = await ctx.prisma.release.findUnique({
        where: { id: input.releaseId },
        include: { tracks: true },
      });
      if (!release) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(release.tenantId, ctx.user.tenantId);

      const maps = await loadAssignmentMaps(ctx.prisma, ctx.user.tenantId);

      const trackInputs: TrackSplitInput[] = [];
      for (const track of release.tracks) {
        const contractId = maps.trackContract.get(track.id);
        const def = contractId ? maps.contractDefs.get(contractId) : undefined;
        const shares = def?.splits.map((s) => ({ payeeId: s.payeeId, shareBp: s.shareBp })) ?? [];
        const lines = await ctx.prisma.statementLine.findMany({
          where: { trackId: track.id, reconStatus: "confirmed" },
          select: { realizedMinor: true, nativeAmountMinor: true },
        });
        const weight = lines.reduce(
          (acc, l) => acc + (l.realizedMinor ?? l.nativeAmountMinor),
          0n,
        );
        trackInputs.push({ weight, shares });
      }
      return rollUpReleaseSplit(trackInputs);
    }),
});
