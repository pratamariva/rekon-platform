import { hash, verify } from "@node-rs/argon2";
import { createHash } from "node:crypto";

// Argon2id parameters (OWASP-ish baseline). HARDEN: tune memory/time cost to your
// hardware and re-benchmark; consider a pepper stored in a secret manager.
const ARGON2_OPTS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTS);
}

export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, password, ARGON2_OPTS);
  } catch {
    return false;
  }
}

// A dummy hash to verify against when a user does not exist, so login timing does not
// leak account existence. Generated once at module load.
let dummyHashCache: string | null = null;
export async function dummyHash(): Promise<string> {
  if (dummyHashCache === null) {
    dummyHashCache = await hashPassword("rekon-dummy-password-for-timing-safety");
  }
  return dummyHashCache;
}

const MIN_LENGTH = 12;

// Returns a human-readable policy violation, or null if the password passes.
export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters`;
  }
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a digit";
  return null;
}

// Check Have I Been Pwned's range API using k-anonymity: only the first 5 chars of
// the SHA-1 hash ever leave this server; the rest is compared locally. Returns the
// number of times the password appears in breaches (0 = not found). Fails OPEN
// (returns 0) on network error so sign-up is not blocked by an HIBP outage.
// HARDEN: decide your own fail-open vs fail-closed policy; add caching + a timeout
// budget; consider self-hosting the range data for privacy and reliability.
export async function hibpBreachCount(password: string): Promise<number> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return 0;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, count] = line.trim().split(":");
      if (hashSuffix === suffix) return Number(count ?? 0);
    }
    return 0;
  } catch {
    return 0;
  }
}
