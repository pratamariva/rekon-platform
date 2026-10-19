import { router, tenantProcedure } from "../trpc.js";
import { payableFromLedgers } from "../lib/contracts.js";

export const dashboardRouter = router({
  // KPIs computed LIVE from the ledger/statement state.
  // HARDEN: cache these (or precompute) at scale; several of these are full scans.
  summary: tenantProcedure.query(async ({ ctx }) => {
    const tenant = await ctx.prisma.tenant.findUniqueOrThrow({
      where: { id: ctx.user.tenantId },
    });
    const functional = tenant.functionalCurrency;

    const [payees, unreconciledCount, openExceptions, statements] = await Promise.all([
      ctx.prisma.payee.findMany({
        where: { tenantId: ctx.user.tenantId },
        include: { balances: true },
      }),
      ctx.prisma.statementLine.count({
        where: {
          statement: { tenantId: ctx.user.tenantId },
          reconStatus: { in: ["unpaid", "provisional"] },
        },
      }),
      ctx.prisma.exception.findMany({
        where: { tenantId: ctx.user.tenantId, resolved: false },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      ctx.prisma.statement.findMany({
        where: { tenantId: ctx.user.tenantId },
        include: { lines: true },
      }),
    ]);

    let totalPayable = 0n;
    let pendingPayoutsCount = 0;
    for (const p of payees) {
      const functionalBalances = p.balances.filter((b) => b.currency === functional);
      const payable = payableFromLedgers(functionalBalances);
      totalPayable += payable;
      if (payable > 0n) pendingPayoutsCount += 1;
    }

    const activePayeesCount = payees.filter((p) => p.portalStatus === "active").length;

    // Revenue trend: realized functional revenue from confirmed lines, by period,
    // last 6 periods.
    const byPeriod = new Map<string, bigint>();
    for (const s of statements) {
      let realized = 0n;
      for (const line of s.lines) {
        if (line.reconStatus === "confirmed" && line.realizedMinor !== null) {
          realized += line.realizedMinor;
        }
      }
      byPeriod.set(s.period, (byPeriod.get(s.period) ?? 0n) + realized);
    }
    const revenueTrend = [...byPeriod.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-6)
      .map(([period, realizedFunctionalMinor]) => ({ period, realizedFunctionalMinor }));

    return {
      functionalCurrency: functional,
      totalPayableFunctionalMinor: totalPayable,
      unreconciledCount,
      pendingPayoutsCount,
      activePayeesCount,
      revenueTrend,
      openExceptions,
    };
  }),
});
