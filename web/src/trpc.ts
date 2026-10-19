import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
// Type-only import of the backend router. Erased at build; gives end-to-end types.
import type { AppRouter } from "../../rekon-api/src/routers/_app.js";

export const trpc = createTRPCReact<AppRouter>();

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/trpc";

export function makeTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: API_URL,
        transformer: superjson,
        // Send the httpOnly session cookie with every request. The session is NEVER
        // read from JS/localStorage — only the cookie, set server-side.
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" });
        },
      }),
    ],
  });
}
