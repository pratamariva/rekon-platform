# Rekon web — royalty accounting frontend

> ⚠️ Part of the Rekon **scaffold**. Pairs with `../rekon-api`.

React + TypeScript + Vite + Tailwind + tRPC (react-query) + superjson +
react-router-dom (HashRouter) + fflate.

## Run

```bash
npm install
# Point at the running API's /trpc endpoint:
echo 'VITE_API_URL=http://localhost:3000/trpc' > .env.local
npm run dev            # http://localhost:5173
```

`VITE_API_URL` must be the API's `/trpc` URL. All requests use
`credentials: "include"` so the httpOnly session cookie flows; the session is never read
from JS or localStorage.

## Claim invite flow

1. Start the API and run its seed (`npm run db:seed` in `../rekon-api`) — it prints a
   tenant ID and two invite tokens.
2. Open the web app → **Claim your account** → paste a token, set a password (live policy
   hints), tick the UU PDP consent box.
3. The admin token lands you in the admin shell; the payee token lands in the read-only
   payee portal. Admin and payee route trees never overlap (the server also rejects
   cross-role access).

## Design system

Colors are design tokens in `src/index.css` (light + `.dark`), mapped to semantic
Tailwind names in `tailwind.config.js` — no scattered hex. Self-hosted system fonts only.
WCAG AA: keyboard nav, visible `:focus-visible`, status shown as color **+ icon + text**,
right-aligned tabular money, and every amount shows its currency code.

## Typecheck

```bash
npm run typecheck      # tsc --noEmit (end-to-end types from ../rekon-api AppRouter)
```
