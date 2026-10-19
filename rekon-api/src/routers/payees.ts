import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure, assertTenant } from "../trpc.js";
import { payableFromLedgers } from "../lib/contracts.js";
import { CURRENCY_CODES, type CurrencyCode } from "../lib/money.js";
import { writeAudit } from "../audit/log.js";

const currencyEnum = z.enum(CURRENCY_CODES as unknown as [string, ...string[]]);

export const payeesRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    const payees = await ctx.prisma.payee.findMany({
      where: { tenantId: ctx.user.tenantId },
      include: { balances: { include: { ledger: true } } },
      orderBy: { name: "asc" },
    });
    return payees.map((p) => ({
      id: p.id,
      name: p.name,
      displayCurrency: p.displayCurrency,
      payoutRail: p.payoutRail,
      portalStatus: p.portalStatus,
      runningPayable: payableFromLedgers(p.balances),
      hasUnrecoupedAdvance: p.balances.some((b) => b.amountMinor < 0n),
      ledgers: p.balances.map((b) => ({
        ledgerId: b.ledgerId,
        ledgerName: b.ledger?.name ?? "Primary",
        currency: b.currency,
        amountMinor: b.amountMinor,
      })),
    }));
  }),

  detail: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const payee = await ctx.prisma.payee.findUnique({
        where: { id: input.id },
        include: { balances: { include: { ledger: true } } },
      });
      if (!payee) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(payee.tenantId, ctx.user.tenantId);
      const payouts = await ctx.prisma.payout.findMany({
        where: { payeeId: payee.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      return {
        id: payee.id,
        name: payee.name,
        displayCurrency: payee.displayCurrency,
        payoutRail: payee.payoutRail,
        portalStatus: payee.portalStatus,
        balances: payee.balances.map((b) => ({
          ledgerId: b.ledgerId,
          ledgerName: b.ledger?.name ?? "Primary",
          currency: b.currency,
          amountMinor: b.amountMinor,
          isUnrecouped: b.amountMinor < 0n,
        })),
        recentPayouts: payouts,
      };
    }),

  create: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1),
        displayCurrency: currencyEnum,
        payoutRail: z.enum(["bank_transfer", "paynow"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenant = await ctx.prisma.tenant.findUniqueOrThrow({
        where: { id: ctx.user.tenantId },
      });
      const payee = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.payee.create({
          data: {
            tenantId: ctx.user.tenantId,
            name: input.name,
            displayCurrency: input.displayCurrency as CurrencyCode,
            payoutRail: input.payoutRail,
            portalStatus: "invited",
          },
        });
        // Zero Primary (crossed) ledger balance in the tenant's functional currency.
        await tx.payeeBalance.create({
          data: {
            payeeId: created.id,
            ledgerId: null,
            currency: tenant.functionalCurrency,
            amountMinor: 0n,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.user.tenantId,
          actorId: ctx.user.id,
          action: "payee.created",
          recordId: created.id,
          params: { name: input.name },
        });
        return created;
      });
      return payee;
    }),
});
