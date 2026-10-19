import { z } from "zod";
import { router, tenantProcedure, adminProcedure } from "../trpc.js";
import { CURRENCY_CODES, type CurrencyCode } from "../lib/money.js";

const currencyEnum = z.enum(CURRENCY_CODES as unknown as [string, ...string[]]);

export const settingsRouter = router({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenant = await ctx.prisma.tenant.findUniqueOrThrow({
      where: { id: ctx.user.tenantId },
    });
    return {
      name: tenant.name,
      functionalCurrency: tenant.functionalCurrency,
      plan: tenant.plan,
      referenceRateSource: tenant.referenceRateSource,
    };
  }),

  updateGeneral: adminProcedure
    .input(z.object({ name: z.string().min(1), referenceRateSource: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.tenant.update({
        where: { id: ctx.user.tenantId },
        data: { name: input.name, referenceRateSource: input.referenceRateSource },
      });
    }),

  // Changing the functional currency after statements are issued is risky — issued
  // statements froze shares in the old currency. We warn with the issued count.
  // HARDEN: block or require an explicit re-statement migration before allowing this.
  updateCurrency: adminProcedure
    .input(z.object({ functionalCurrency: currencyEnum }))
    .mutation(async ({ ctx, input }) => {
      const issuedCount = await ctx.prisma.statement.count({
        where: { tenantId: ctx.user.tenantId, status: "issued" },
      });
      await ctx.prisma.tenant.update({
        where: { id: ctx.user.tenantId },
        data: { functionalCurrency: input.functionalCurrency as CurrencyCode },
      });
      return {
        ok: true,
        warning:
          issuedCount > 0
            ? `${issuedCount} issued statement(s) froze shares in the previous functional currency.`
            : null,
      };
    }),

  listRates: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prisma.referenceRate.findMany({
      where: { tenantId: ctx.user.tenantId },
      orderBy: [{ base: "asc" }, { asOf: "desc" }],
    });
  }),

  upsertRate: adminProcedure
    .input(
      z.object({
        base: currencyEnum,
        quote: currencyEnum,
        rate: z.string().min(1),
        source: z.string().min(1),
        asOf: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.referenceRate.upsert({
        where: {
          tenantId_base_quote_asOf: {
            tenantId: ctx.user.tenantId,
            base: input.base as CurrencyCode,
            quote: input.quote as CurrencyCode,
            asOf: input.asOf,
          },
        },
        create: {
          tenantId: ctx.user.tenantId,
          base: input.base as CurrencyCode,
          quote: input.quote as CurrencyCode,
          rate: input.rate,
          source: input.source,
          asOf: input.asOf,
        },
        update: { rate: input.rate, source: input.source },
      });
    }),

  listTeam: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findMany({
      where: { tenantId: ctx.user.tenantId },
      select: {
        id: true,
        email: true,
        role: true,
        claimedAt: true,
        emailVerified: true,
      },
      orderBy: { email: "asc" },
    });
  }),

  listSources: tenantProcedure.query(async ({ ctx }) => {
    const items = await ctx.prisma.item.findMany({
      where: { tenantId: ctx.user.tenantId },
      select: { source: true },
      distinct: ["source"],
    });
    return items.map((i) => i.source);
  }),
});
