import type { RecordHealthSnapshotInput } from "@callsheet/db/types";

import {
  compareActions,
  operationalDay,
  scorePlacement,
  type PlacementScore,
  type ScoredAction,
  type ScoringContact,
  type ScoringPlacement,
} from "@/lib/scoring";

const DAY_MS = 86_400_000;

/** What the Today query needs from the database. lib/load-today.ts wires in the repositories. */
export type TodayRepositories<P extends ScoringPlacement> = {
  findActivePlacements(): Promise<readonly P[]>;
  listEscalationContacts(): Promise<readonly ScoringContact[]>;
  recordHealthSnapshots(snapshots: readonly RecordHealthSnapshotInput[]): Promise<unknown>;
};

export type TodayResult<P extends ScoringPlacement> = {
  /** The Eastern day number this list is for. */
  day: number;
  placements: { placement: P; score: PlacementScore }[];
  /** Every action on every placement, highest score first. */
  actions: ScoredAction[];
};

/**
 * The Today query. Scores every active placement for the reference date and
 * records each one's health for that Eastern day before returning, so rule 4
 * builds its history from ordinary use. Reading twice in a day replaces that
 * day's snapshot rather than adding one.
 */
export async function runTodayQuery<P extends ScoringPlacement>(
  referenceDate: Date,
  repositories: TodayRepositories<P>,
): Promise<TodayResult<P>> {
  const [placements, contacts] = await Promise.all([
    repositories.findActivePlacements(),
    repositories.listEscalationContacts(),
  ]);
  const day = operationalDay(referenceDate);

  const scored = placements.map((placement) => ({
    placement,
    score: scorePlacement(placement, { referenceDate, contacts }),
  }));

  await repositories.recordHealthSnapshots(
    scored.map(({ placement, score }) => ({
      placementId: placement.id,
      day: new Date(day * DAY_MS),
      status: score.health,
      score: score.score,
    })),
  );

  return {
    day,
    placements: scored,
    actions: scored.flatMap(({ score }) => score.actions).sort(compareActions),
  };
}
