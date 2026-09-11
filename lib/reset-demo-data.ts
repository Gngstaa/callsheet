import { demoDataRepository } from "@callsheet/db";

import { buildDemoData } from "@/lib/demo-data";
import { timed } from "@/lib/server-timing";

/**
 * Replaces everything in the database with the demo set, dated from the
 * reference date. Safe to run repeatedly; used by `pnpm db:seed` and the
 * reset control.
 */
export async function resetDemoData(referenceDate: Date) {
  const data = await timed("reset: build demo data", () => buildDemoData(referenceDate));
  await timed("reset: replace all rows", () => demoDataRepository.replaceAll(data));
  return {
    placements: data.placements.length,
    clients: data.clients.length,
    healthSnapshots: data.healthSnapshots.length,
  };
}
