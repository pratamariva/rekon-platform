import type { Role } from "@prisma/client";

// 2FA is STUBBED. Admins are flagged as requiring 2FA so the UI and policy can be
// built out, but no OTP is actually issued or verified yet.
// HARDEN: implement TOTP (e.g. otplib) with encrypted secret storage + recovery
// codes, or delegate to an IdP. Enforce at login before issuing a session.
export function twoFactorRequiredFor(role: Role): boolean {
  return role === "admin";
}

export function verifyOtp(_userId: string, _code: string): never {
  throw new Error("2FA not implemented (HARDEN: wire up TOTP + recovery codes)");
}
