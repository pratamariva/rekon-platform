import { PrismaClient } from "@prisma/client";

// Single Prisma client for the process. HARDEN: configure connection pooling
// (e.g. PgBouncer / Prisma Accelerate) and sensible timeouts before prod.
export const prisma = new PrismaClient();

export type DbClient = PrismaClient;
// Transaction client type: the interactive-transaction callback arg.
export type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
