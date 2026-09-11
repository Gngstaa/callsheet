import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "./generated/prisma/client";

declare global {
  var callsheetDb: PrismaClient | undefined;
}

/**
 * The shared Prisma client, created on first use so that importing this
 * package never needs a database. Kept on globalThis so hot reloads in
 * development do not open a new pool each time.
 *
 * Only repositories call this. Nothing outside packages/db/repositories
 * should query the database.
 */
export function db(): PrismaClient {
  if (globalThis.callsheetDb) return globalThis.callsheetDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is unset. Add it to .env.local at the repo root.");
  }

  globalThis.callsheetDb = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });
  return globalThis.callsheetDb;
}
