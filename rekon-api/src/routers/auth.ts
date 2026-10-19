import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, authedProcedure } from "../trpc.js";
import { lucia } from "../auth/lucia.js";
import {
  hashPassword,
  verifyPassword,
  dummyHash,
  passwordPolicyError,
  hibpBreachCount,
} from "../auth/password.js";
import { hashInviteToken } from "../auth/invite.js";
import { CURRENCY_CODES, type CurrencyCode } from "../lib/money.js";

const currencyEnum = z.enum(
  CURRENCY_CODES as unknown as [string, ...string[]],
);

async function enforcePasswordStrength(password: string): Promise<void> {
  const policyErr = passwordPolicyError(password);
  if (policyErr) throw new TRPCError({ code: "BAD_REQUEST", message: policyErr });
  const breaches = await hibpBreachCount(password);
  if (breaches > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This password appears in known data breaches — choose another.",
    });
  }
}

export const authRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        tenantName: z.string().min(1),
        functionalCurrency: currencyEnum,
        email: z.string().email(),
        password: z.string(),
        consent: z.literal(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await enforcePasswordStrength(input.password);
      const passwordHash = await hashPassword(input.password);

      const user = await ctx.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: input.tenantName,
            functionalCurrency: input.functionalCurrency as CurrencyCode,
            plan: "indie",
          },
        });
        return tx.user.create({
          data: {
            tenantId: tenant.id,
            email: input.email.toLowerCase(),
            passwordHash,
            role: "admin",
            emailVerified: false,
            consentAt: new Date(),
          },
        });
      });

      const session = await lucia.createSession(user.id, {});
      const cookie = lucia.createSessionCookie(session.id);
      ctx.setSessionCookie(cookie.value, cookie.attributes);
      return { ok: true };
    }),

  login: publicProcedure
    .input(
      z.object({
        tenantId: z.string().min(1),
        email: z.string().email(),
        password: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: {
          tenantId_email: { tenantId: input.tenantId, email: input.email.toLowerCase() },
        },
      });
      // Always do a verify to keep timing constant whether or not the user exists.
      const hash = user?.passwordHash ?? (await dummyHash());
      const valid = await verifyPassword(hash, input.password);
      if (!user || !user.passwordHash || !valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }
      // HARDEN: if twoFactorRequiredFor(user.role), require an OTP step here before
      // issuing a session (2FA is stubbed — see auth/twoFactor.ts).
      const session = await lucia.createSession(user.id, {});
      const cookie = lucia.createSessionCookie(session.id);
      ctx.setSessionCookie(cookie.value, cookie.attributes);
      return { ok: true, role: user.role };
    }),

  claimInvite: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        password: z.string(),
        consent: z.literal(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await enforcePasswordStrength(input.password);
      const tokenHash = hashInviteToken(input.token);
      const user = await ctx.prisma.user.findUnique({
        where: { inviteTokenHash: tokenHash },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite" });
      if (user.inviteExpiresAt && user.inviteExpiresAt.getTime() < Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has expired" });
      }
      const passwordHash = await hashPassword(input.password);
      await ctx.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            consentAt: new Date(),
            claimedAt: new Date(),
            inviteTokenHash: null, // burn the token
            inviteExpiresAt: null,
            emailVerified: true,
          },
        });
        if (user.payeeId) {
          await tx.payee.update({
            where: { id: user.payeeId },
            data: { portalStatus: "active" },
          });
        }
      });
      const session = await lucia.createSession(user.id, {});
      const cookie = lucia.createSessionCookie(session.id);
      ctx.setSessionCookie(cookie.value, cookie.attributes);
      return { ok: true, role: user.role };
    }),

  logout: authedProcedure.mutation(async ({ ctx }) => {
    if (ctx.session) await lucia.invalidateSession(ctx.session.id);
    const cookie = lucia.createBlankSessionCookie();
    ctx.setSessionCookie(cookie.value, cookie.attributes);
    return { ok: true };
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const tenant = await ctx.prisma.tenant.findUnique({
      where: { id: ctx.user.tenantId },
      select: { id: true, name: true, functionalCurrency: true, plan: true },
    });
    const self = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { email: true },
    });
    return {
      id: ctx.user.id,
      email: self?.email ?? "",
      role: ctx.user.role,
      payeeId: ctx.user.payeeId,
      tenant,
    };
  }),
});
