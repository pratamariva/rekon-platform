# Rekon API — royalty accounting backend

> ⚠️ **NOT PRODUCTION-READY.** This is a SCAFFOLD for engineers to harden. The
> accounting math is correct and tested; most infrastructure concerns (rails, email,
> 2FA, object storage, DB-level immutability) are deliberately stubbed and marked with
> `// HARDEN:` comments. Grep for them before shipping anything near real money or PII.

Node + TypeScript (ESM) · Fastify · tRPC v11 · Prisma + PostgreSQL · Lucia sessions ·
Zod · decimal.js · @node-rs/argon2 · superjson · vitest.

## The one manual step

Start Postgres, run migrations, seed:

```bash
cp .env.example .env            # defaults work with the bundled docker compose
npm install
npm run db:up                   # starts Postgres via docker compose
npm run db:migrate              # create schema (prisma migrate dev)
npm run db:seed                 # load the demo tenant + print invite tokens
npm run dev                     # API on http://localhost:3000
```

The seed prints a **tenant ID** and two **raw invite tokens** (admin + payee) to the
console. You claim those in the web app (see below). They are shown once — the server
stores only their SHA-256 hashes.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | `tsx watch src/server.ts` |
| `npm run build` | `prisma generate && tsc` |
| `npm run db:up` | `docker compose up -d` (Postgres) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:deploy` | `prisma migrate deploy` (prod migrations) |
| `npm run db:seed` | load demo data + print invite tokens |
| `npm run db:reset` | `prisma migrate reset --force` |
| `npm test` | vitest (the accounting + ingestion math) |

## Try the full loop

1. `npm run db:seed`, copy the tenant ID + admin token.
2. In the web app, **Claim your account** with the admin token → you're in as admin.
3. **Statements** → the seeded `ST-2026-Q2-014` is already issued with frozen shares.
4. **Payees** → Andi Pratama shows a running payable (Primary ledger, minus his
   unrecouped advance which holds back only itself).
5. **Payouts → Due** → run a partial payout for a payee, attach a proof.
6. Claim the **payee** token in a separate browser → the payee portal shows only that
   payee's statements, frozen share, and payout receipts (no cross-payee leakage).
7. **Statements → Import** → upload a FUGA/Believe CSV; commit re-parses server-side,
   auto-maps by ISRC, and queues anything unmatched to **Cleanup**.

## What is genuinely correct (and tested)

`src/lib/*` is pure and unit-tested (`npm test`). The tests reproduce Infinite Catalog's
published worked example as the oracle:

- **Integer-minor money** (`money.ts`) — bigint minor units + explicit currency, never
  floats. decimal.js is used only for ratio math, then rounded back to integer minor.
- **Largest-remainder allocation** (`reconciliation.ts`) — split parts tie to the total
  **exactly**; deterministic id tiebreak; equal-split fallback on zero weights.
- **Contract tree + ledger postings** (`contracts.ts`) — nearest-first resolution
  (transaction → item → track → release; none = 100% label); the label share is the
  implicit remainder of 10000 bp, never a stored row; `applyContract` asserts it ties.
- **Payout drawdown** (`payout.ts`) — largest-positive-ledger-first; negative/advance
  ledgers hold back only themselves; never over-draws the payable.
- **Split roll-up** (`splits.ts`) and **CSV parsing** (`ingestion/`) — dialect-aware,
  dot/comma decimals, parens-negatives, symbol stripping, rejects over-precision.

Oracle values verified by tests: A 50% of $1000 = $500, B 60% = $600, C 45% of $200 =
$90, item C 75% of $200 = $150, D 80% of $100 = $80, E 100% of $100 = $100 (no label);
ledgers Primary −$1000 + Publishing +$750 → payable $750; paying $750 draws entirely
from Publishing.

## Deploy (sketch)

- **DB:** Neon (managed Postgres). Set `DATABASE_URL`, run `npm run db:deploy`.
- **API:** Railway (or similar). Set `NODE_ENV=production`, `WEB_ORIGIN`, `COOKIE_DOMAIN`.
- **Web:** Vercel. Set `VITE_API_URL` to the API's `/trpc` URL.
- **Shared-domain cookie:** the session is an httpOnly, Secure, SameSite=lax cookie. For
  api + web to share it, serve both under one parent domain (e.g. `api.rekon.app` and
  `app.rekon.app`) and set `COOKIE_DOMAIN=.rekon.app`. Cross-site cookies (different
  registrable domains) will NOT work with SameSite=lax — keep them on one parent domain.

## Hardening checklist (do before production)

- [ ] **Rate limiting** — add `@fastify/rate-limit` on auth + mutations.
- [ ] **Security headers** — add `@fastify/helmet`.
- [ ] **Real 2FA** — `twoFactor.ts` is a stub; implement TOTP + recovery codes and
      enforce at login for admins.
- [ ] **Email / OTP** — invites are printed to console; wire real email + verification.
- [ ] **Mixed-currency allocation** — `reconciliation.allocate` rejects multi-currency
      statements; implement per-currency allocation + FX netting.
- [ ] **DB-level append-only** — enforce immutability (triggers rejecting UPDATE/DELETE)
      on AuditEntry, postings, remittances, allocations; consider a hash chain.
- [ ] **Real payout rails** — `payouts.run` marks paid immediately; integrate bank
      transfer / PayNow and drive status from provider webhooks.
- [ ] **Object storage + signed URLs** — proofs are stored as opaque strings/data URLs;
      move to object storage with short-lived signed download URLs and server-side
      content-type/size validation.
- [ ] **UU PDP (Indonesia PDP law) review** — have counsel review consent capture, data
      retention, residency, and subject-access handling for PII.
