import { Lucia } from "lucia";
import { PrismaAdapter } from "@lucia-auth/adapter-prisma";
import { prisma } from "../db.js";
import type { Role } from "@prisma/client";

const isProd = process.env.NODE_ENV === "production";
const cookieDomain = process.env.COOKIE_DOMAIN?.trim() || undefined;

const adapter = new PrismaAdapter(prisma.session, prisma.user);

// 7-day httpOnly session cookie. Secure in prod, SameSite=lax so top-level navigations
// from the web app carry it. COOKIE_DOMAIN lets api + web share it on a parent domain.
export const lucia = new Lucia(adapter, {
  sessionExpiresIn: undefined, // use default (reset on activity within 30d window)
  sessionCookie: {
    name: "rekon_session",
    expires: false, // persistent cookie; Lucia still enforces server-side expiry
    attributes: {
      secure: isProd,
      sameSite: "lax",
      domain: cookieDomain,
    },
  },
  getUserAttributes: (attributes) => ({
    tenantId: attributes.tenantId,
    role: attributes.role,
    payeeId: attributes.payeeId,
  }),
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      tenantId: string;
      role: Role;
      payeeId: string | null;
    };
  }
}
