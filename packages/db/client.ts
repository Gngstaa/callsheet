import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "./generated/prisma/client";

declare global {
  var callsheetDb: PrismaClient | undefined;
}

// Idle connections are kept for five minutes rather than the pool's default
// ten seconds. Measured from a distant region, a statement on a warm
// connection took ~300ms and one that had to reconnect took 1.5-3.5s, so a
// tap a minute after the last one paid the reconnect on every statement.
const IDLE_CONNECTION_MS = 5 * 60_000;

function createClient(connectionString: string): PrismaClient {
  const adapter = new PrismaNeon({ connectionString, idleTimeoutMillis: IDLE_CONNECTION_MS });
  if (process.env.CALLSHEET_TIMING !== "1") return new PrismaClient({ adapter });

  // Timing runs log each statement's duration and the start of its SQL, which
  // names tables and columns only; parameter values are not logged.
  const client = new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] });
  client.$on("query", (event) => {
    console.log(`[timing] sql ${Math.round(event.duration)}ms ${event.query.slice(0, 70)}`);
  });
  return client;
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

  globalThis.callsheetDb = createClient(connectionString);
  return globalThis.callsheetDb;
}
