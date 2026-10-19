import "@fastify/cookie"; // loads the FastifyReply.setCookie type augmentation
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import superjson from "superjson";
import type { Session, CookieAttributes } from "lucia";
import { lucia } from "./auth/lucia.js";
import { prisma } from "./db.js";
import type { Role } from "@prisma/client";

export interface AuthUser {
  id: string;
  tenantId: string;
  role: Role;
  payeeId: string | null;
}

export interface Context {
  prisma: typeof prisma;
  user: AuthUser | null;
  session: Session | null;
  // Cookie helpers backed by the Fastify reply. Session is read from the httpOnly
  // cookie ONLY — never an Authorization header or anything the client-side JS can set.
  setSessionCookie: (value: string, attributes: CookieAttributes) => void;
}

export async function createContext({
  req,
  res,
}: CreateFastifyContextOptions): Promise<Context> {
  const setSessionCookie = (value: string, attributes: CookieAttributes) => {
    void res.setCookie(
      lucia.sessionCookieName,
      value,
      attributes as Parameters<typeof res.setCookie>[2],
    );
  };

  const cookieHeader = req.headers.cookie ?? "";
  const sessionId = lucia.readSessionCookie(cookieHeader);
  if (!sessionId) {
    return { prisma, user: null, session: null, setSessionCookie };
  }

  const { session, user } = await lucia.validateSession(sessionId);
  if (session && session.fresh) {
    const cookie = lucia.createSessionCookie(session.id);
    setSessionCookie(cookie.value, cookie.attributes);
  }
  if (!session) {
    const cookie = lucia.createBlankSessionCookie();
    setSessionCookie(cookie.value, cookie.attributes);
    return { prisma, user: null, session: null, setSessionCookie };
  }

  return {
    prisma,
    session,
    user: {
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      payeeId: user.payeeId,
    },
    setSessionCookie,
  };
}

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Tenant-scoped: identical to authed, but names the intent and guarantees a tenantId
// is present in ctx.user for every downstream query's where-clause.
export const tenantProcedure = authedProcedure;

export const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

export const payeeProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "payee" || !ctx.user.payeeId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx: { ...ctx, payeeId: ctx.user.payeeId } });
});

// Guard against cross-tenant access. We throw NOT_FOUND (not FORBIDDEN) so an attacker
// cannot even learn whether a record id exists in another tenant.
export function assertTenant(recordTenantId: string, userTenantId: string): void {
  if (recordTenantId !== userTenantId) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}
