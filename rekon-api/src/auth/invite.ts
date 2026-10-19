import { randomBytes, createHash } from "node:crypto";

export interface InviteToken {
  raw: string; // sent to the invitee (one time); never stored
  hash: string; // stored server-side; the raw token is never persisted
}

// Generate an invite token. We store ONLY the SHA-256 hash, so a database leak does
// not expose usable invite links. The raw token is shown once (printed to console in
// the seed; emailed in a real deployment).
export function generateInviteToken(): InviteToken {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashInviteToken(raw) };
}

export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
