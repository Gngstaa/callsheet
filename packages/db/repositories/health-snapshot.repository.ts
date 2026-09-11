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

  /** Records a batch in one transaction. The Today query calls this on every read. */
  recordMany(snapshots: readonly RecordHealthSnapshotInput[]) {
    const client = db();
    return client.$transaction(snapshots.map((snapshot) => upsertSnapshot(client, snapshot)));
  },
};
