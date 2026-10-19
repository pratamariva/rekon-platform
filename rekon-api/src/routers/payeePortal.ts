import { router, payeeProcedure } from "../trpc.js";

// Every query here is scoped to ctx.payeeId — a payee can only ever see their own
// data. The server enforces this; there is no admin route mounted for payees.
export const payeePortalRouter = router({
  myEarnings: payeeProcedure.query(async ({ ctx }) => {
    const participations = await ctx.prisma.statementParticipant.findMany({
      where: { payeeId: ctx.payeeId },
      include: { statement: true },
    });
    const lifetimeFunctionalMinor = participations.reduce(
      (acc, p) => acc + p.shareFunctionalMinor,
      0n,
    );

    const splits = await ctx.prisma.contractSplit.findMany({
      where: { payeeId: ctx.payeeId, contract: { tenantId: ctx.user.tenantId } },
      include: { contract: true },
    });
    const payee = await ctx.prisma.payee.findUniqueOrThrow({ where: { id: ctx.payeeId } });

    return {
      displayCurrency: payee.displayCurrency,
      lifetimeFunctionalMinor,
      contractShares: splits.map((s) => ({
        contractId: s.contractId,
        contractName: s.contract.name,
        role: s.role,
        shareBp: s.shareBp,
      })),
    };
  }),

  // Only statements this payee participated in, with this payee's own frozen share.
  myStatements: payeeProcedure.query(async ({ ctx }) => {
    const participations = await ctx.prisma.statementParticipant.findMany({
      where: { payeeId: ctx.payeeId, statement: { status: "issued" } },
      include: { statement: true },
      orderBy: { statement: { issuedAt: "desc" } },
    });
    return participations.map((p) => ({
      statementId: p.statementId,
      title: p.statement.title,
      period: p.statement.period,
      issuedAt: p.statement.issuedAt,
      myShareFunctionalMinor: p.shareFunctionalMinor,
    }));
  }),

  myPayouts: payeeProcedure.query(async ({ ctx }) => {
    return ctx.prisma.payout.findMany({
      where: { payeeId: ctx.payeeId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        payoutCurrency: true,
        payoutAmountMinor: true,
        status: true,
        paidAt: true,
        proofUrl: true,
        realizedRate: true,
      },
    });
  }),

  // Download-only: the payee's own payment proofs.
  myDocuments: payeeProcedure.query(async ({ ctx }) => {
    const payouts = await ctx.prisma.payout.findMany({
      where: { payeeId: ctx.payeeId, proofUrl: { not: null } },
      select: { id: true, proofUrl: true, paidAt: true, payoutCurrency: true, payoutAmountMinor: true },
      orderBy: { paidAt: "desc" },
    });
    return payouts.map((p) => ({
      payoutId: p.id,
      proofUrl: p.proofUrl,
      paidAt: p.paidAt,
      currency: p.payoutCurrency,
      amountMinor: p.payoutAmountMinor,
    }));
  }),
});
