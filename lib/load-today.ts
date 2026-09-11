import {
  escalationContactRepository,
  healthSnapshotRepository,
  placementRepository,
} from "@callsheet/db";
import { after } from "next/server";

import { describeError } from "@/lib/describe-error";
import { timed, timingNote } from "@/lib/server-timing";
import { runTodayQuery } from "@/lib/today-query";

/** The Today query against the database. Call it while rendering a request. */
export function loadToday(referenceDate: Date) {
  return timed("today: query and score", () =>
    runTodayQuery(
      referenceDate,
      {
        findActivePlacements: () => timed("today: placements query", () => placementRepository.findActiveHydrated()),
        listEscalationContacts: () => timed("today: contacts query", () => escalationContactRepository.list()),
        recordHealthSnapshots: (snapshots) => healthSnapshotRepository.recordMany(snapshots),
      },
      {
        defer: (task) =>
          after(async () => {
            timingNote("today: deferred snapshot write started");
            try {
              await timed("today: deferred snapshot write", task);
            } catch (error) {
              console.error(`Recording today's health snapshots failed: ${describeError(error)}`);
            }
          }),
      },
    ),
  );
}
