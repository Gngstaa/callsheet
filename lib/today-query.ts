import type { RecordHealthSnapshotInput } from "@callsheet/db/types";

import {
  compareActions,
  compareUpcoming,
  operationalDay,
  scorePlacement,
  type PlacementScore,
  type ScoredAction,
  type ScoringContact,
  type ScoringPlacement,
  type UpcomingItem,
} from "@/lib/scoring";
import { timedSync } from "@/lib/server-timing";

const DAY_MS = 86_400_000;

/** What the Today query needs from the database. lib/load-today.ts wires in the repositories. */
export type TodayRepositories<P extends ScoringPlacement> = {
  findActivePlacements(): Promise<readonly P[]>;
  listEscalationContacts(): Promise<readonly ScoringContact[]>;
  recordHealthSnapshots(snapshots: readonly RecordHealthSnapshotInput[]): Promise<unknown>;
};

export type TodayOptions = {
  /** Runs work after the response is sent. Next's after() in production. */
  defer(task: () => Promise<void>): void;
};

export type TodayResult<P extends ScoringPlacement> = {
  /** The Eastern day number this list is for. */
  day: number;
  placements: { placement: P; score: PlacementScore }[];
  /** Every action on every placement, highest score first. */
  actions: ScoredAction[];
  /** Everything falling due later on every placement, soonest first. */
  upcoming: UpcomingItem[];
};

/**
 * The Today query. Scores every active placement for the reference date and
 * hands back the list straight away. Recording each placement's health for
 * the day is deferred until after the response: rule 4 reads only yesterday
 * and earlier, so today's snapshot cannot change today's score, and the list
 * should not wait on a write. Reading twice in a day replaces that day's
 * snapshot rather than adding one.
 */
export async function runTodayQuery<P extends ScoringPlacement>(
  referenceDate: Date,
  repositories: TodayRepositories<P>,
  options: TodayOptions,
): Promise<TodayResult<P>> {
  const [placements, contacts] = await Promise.all([
    repositories.findActivePlacements(),
    repositories.listEscalationContacts(),
  ]);
  const day = operationalDay(referenceDate);

  const scored = timedSync("today: scoring", () =>
    placements.map((placement) => ({
      placement,
      score: scorePlacement(placement, { referenceDate, contacts }),
    })),
  );

  const snapshots = scored.map(({ placement, score }) => ({
    placementId: placement.id,
    day: new Date(day * DAY_MS),
    status: score.health,
    score: score.score,
  }));
  options.defer(async () => {
    await repositories.recordHealthSnapshots(snapshots);
  });

  return {
    day,
    placements: scored,
    actions: scored.flatMap(({ score }) => score.actions).sort(compareActions),
    upcoming: scored.flatMap(({ score }) => score.upcoming).sort(compareUpcoming),
  };
}
