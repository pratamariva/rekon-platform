import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./routers/_app.js";
import { createContext } from "./trpc.js";

const PORT = Number(process.env.PORT ?? 3000);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

async function main() {
  const app = Fastify({ logger: true, maxParamLength: 5000 });

  // Exact origin only + credentials so the httpOnly session cookie is sent. NEVER "*".
  await app.register(cors, {
    origin: WEB_ORIGIN,
    credentials: true,
  });
  await app.register(cookie);

  // HARDEN: add @fastify/helmet (security headers) and @fastify/rate-limit (brute-force
  // protection on auth) before production.

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: { router: appRouter, createContext },
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Rekon API listening on :${PORT} (web origin ${WEB_ORIGIN})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
