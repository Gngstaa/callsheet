import { db } from "../client";
import type { HealthStatus, PrismaClient } from "../generated/prisma/client";

export type RecordHealthSnapshotInput = {
  placementId: string;
  /** The America/New_York calendar day, as a `date`. */
  day: Date;
  status: HealthStatus;
  score: number;
};

function upsertSnapshot(
  client: PrismaClient,
  { placementId, day, status, score }: RecordHealthSnapshotInput,
) {
  return client.healthSnapshot.upsert({
    where: { placementId_day: { placementId, day } },
    create: { placementId, day, status, score },
    update: { status, score },
  });
}

export const healthSnapshotRepository = {
  /** One row per placement per Eastern day; recording the day again replaces it. */
  record(snapshot: RecordHealthSnapshotInput) {
    return upsertSnapshot(db(), snapshot);
  },

  /**
   * Records a batch, as the Today query does on every read. Each row stands
   * alone, so they are written side by side rather than in one transaction:
   * against a distant database the batch transaction failed with P2028.
   */
  recordMany(snapshots: readonly RecordHealthSnapshotInput[]) {
    const client = db();
    return Promise.all(snapshots.map((snapshot) => upsertSnapshot(client, snapshot)));
  },
};
