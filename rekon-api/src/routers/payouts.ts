import { z } from "zod";
import { Decimal } from "decimal.js";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure, assertTenant, type Context } from "../trpc.js";
import { drawDownLedgers, alreadyPaid } from "../lib/payout.js";
import { payableFromLedgers, type LedgerPosting } from "../lib/contracts.js";
import { applyPostingsToBalances } from "../lib/balances.js";
import { convertAtRate } from "../lib/reconciliation.js";
import { formatMinor, type CurrencyCode } from "../lib/money.js";
import { writeAudit } from "../audit/log.js";

// ratePerUnit = payee-currency minor per functional minor. Reference rates are stored
// as (base=foreign, quote=functional, rate=functional-per-foreign). To convert
// functional → payee we invert that rate. HARDEN: pick a rate policy (as-booked vs
// as-paid), handle missing rates, and record the rate source on the payout.
async function ratePerUnit(
  prisma: Context["prisma"],
  tenantId: string,
  functional: CurrencyCode,
  payeeCurrency: CurrencyCode,
): Promise<string> {
  if (payeeCurrency === functional) return "1";
  const ref = await prisma.referenceRate.findFirst({
    where: { tenantId, base: payeeCurrency, quote: functional },
    orderBy: { asOf: "desc" },
  });
  if (!ref) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `No reference rate for ${payeeCurrency}/${functional}. Add one in Settings.`,
    });
  }
  return new Decimal(1).dividedBy(new Decimal(ref.rate)).toString();
}

interface RunInput {
  payeeId: string;
  statementId?: string;
  amountMinor?: bigint; // optional partial; defaults to full payable
}

// Shared payout core. `run` and `runBulk` both call this (equivalent to reusing the
// `run` mutation through a tRPC caller, without the circular import).
async function runPayout(ctx: Context & { user: { tenantId: string; id: string } }, input: RunInput) {
  const payee = await ctx.prisma.payee.findUnique({
    where: { id: input.payeeId },
    include: { balances: true },
  });
  if (!payee) throw new TRPCError({ code: "NOT_FOUND" });
  assertTenant(payee.tenantId, ctx.user.tenantId);

  const tenant = await ctx.prisma.tenant.findUniqueOrThrow({
    where: { id: ctx.user.tenantId },
  });
  const functional = tenant.functionalCurrency;

  // Payouts operate on functional-currency ledger balances.
  const functionalBalances = payee.balances
    .filter((b) => b.currency === functional)
    .map((b) => ({ ledgerId: b.ledgerId, currency: functional, amountMinor: b.amountMinor }));

  const payable = payableFromLedgers(functionalBalances);
  const amount = input.amountMinor ?? payable;
  if (amount <= 0n) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing payable" });
  }
  if (amount > payable) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Amount exceeds payable" });
  }

  const debits = drawDownLedgers(functionalBalances, amount);
  const rate = await ratePerUnit(ctx.prisma, ctx.user.tenantId, functional, payee.displayCurrency);
  const payoutAmountMinor = convertAtRate(amount, rate, payee.displayCurrency);

  return ctx.prisma.$transaction(async (tx) => {
    const payout = await tx.payout.create({
      data: {
        tenantId: ctx.user.tenantId,
        payeeId: payee.id,
        statementId: input.statementId ?? null,
        grossFunctionalMinor: amount,
        payoutCurrency: payee.displayCurrency,
        payoutAmountMinor,
        realizedRate: rate,
        rail: payee.payoutRail,
        // HARDEN: integrate a real payout rail (bank transfer / PayNow) and set status
        // from the provider webhook. We mark it paid immediately here.
        status: "paid",
        paidAt: new Date(),
      },
    });
    for (const d of debits) {
      await tx.payoutPosting.create({
        data: {
          payoutId: payout.id,
          ledgerId: d.ledgerId,
          currency: functional,
          amountMinor: d.amountMinor,
        },
      });
    }
    // Lower the payee's ledger balances by the debits.
    const postings: LedgerPosting[] = debits.map((d) => ({
      payeeId: payee.id,
      ledgerId: d.ledgerId,
      currency: functional,
      amountMinor: d.amountMinor,
    }));
    await applyPostingsToBalances(tx, functional, postings);

    await writeAudit(tx, {
      tenantId: ctx.user.tenantId,
      actorId: ctx.user.id,
      action: "payout.sent",
      recordId: payout.id,
      params: {
        amount: formatMinor(payoutAmountMinor, payee.displayCurrency),
        payee: payee.name,
      },
    });
    return payout;
  });
}

export const payoutsRouter = router({
  queue: tenantProcedure.query(async ({ ctx }) => {
    const tenant = await ctx.prisma.tenant.findUniqueOrThrow({
      where: { id: ctx.user.tenantId },
    });
    const functional = tenant.functionalCurrency;
    const payees = await ctx.prisma.payee.findMany({
      where: { tenantId: ctx.user.tenantId },
      include: { balances: true, payouts: { include: { postings: true } } },
      orderBy: { name: "asc" },
    });
    return payees
      .map((p) => {
        const functionalBalances = p.balances.filter((b) => b.currency === functional);
        const remaining = payableFromLedgers(functionalBalances);
        const paid = p.payouts
          .flatMap((po) => po.postings)
          .reduce((acc, po) => acc + po.amountMinor, 0n);
        return {
          payeeId: p.id,
          name: p.name,
          displayCurrency: p.displayCurrency,
          functionalCurrency: functional,
          remainingFunctionalMinor: remaining,
          previouslyPaidFunctionalMinor: alreadyPaid(
            p.payouts.flatMap((po) => po.postings),
          ),
          totalPostings: paid,
        };
      })
      .filter((p) => p.remainingFunctionalMinor > 0n);
  }),

  history: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prisma.payout.findMany({
      where: { tenantId: ctx.user.tenantId, status: "paid" },
      include: { payee: true },
      orderBy: { paidAt: "desc" },
    });
  }),

  run: tenantProcedure
    .input(
      z.object({
        payeeId: z.string(),
        statementId: z.string().optional(),
        amountMinor: z.bigint().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return runPayout(ctx as Context & { user: { tenantId: string; id: string } }, input);
    }),

  runBulk: tenantProcedure
    .input(
      z.object({
        statementId: z.string().optional(),
        payouts: z
          .array(z.object({ payeeId: z.string(), amountMinor: z.bigint().positive().optional() }))
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const results: { payeeId: string; payoutId: string }[] = [];
      for (const p of input.payouts) {
        const payout = await runPayout(
          ctx as Context & { user: { tenantId: string; id: string } },
          { payeeId: p.payeeId, amountMinor: p.amountMinor, statementId: input.statementId },
        );
        results.push({ payeeId: p.payeeId, payoutId: payout.id });
      }
      return { ok: true, results };
    }),

  attachProof: tenantProcedure
    .input(z.object({ payoutId: z.string(), proofUrl: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const payout = await ctx.prisma.payout.findUnique({
        where: { id: input.payoutId },
        include: { payee: true },
      });
      if (!payout) throw new TRPCError({ code: "NOT_FOUND" });
      assertTenant(payout.tenantId, ctx.user.tenantId);
      // HARDEN: store proofs in object storage and serve via short-lived signed URLs;
      // validate content-type/size server-side. Here proofUrl is an opaque string.
      const updated = await ctx.prisma.$transaction(async (tx) => {
        const u = await tx.payout.update({
          where: { id: payout.id },
          data: { proofUrl: input.proofUrl },
        });
        await writeAudit(tx, {
          tenantId: ctx.user.tenantId,
          actorId: ctx.user.id,
          action: "payout.proof_attached",
          recordId: payout.id,
          params: { payee: payout.payee.name },
        });
        return u;
      });
      return updated;
    }),
});
