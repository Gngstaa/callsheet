import {
  escalationContactRepository,
  healthSnapshotRepository,
  placementRepository,
} from "@callsheet/db";

import { runTodayQuery } from "@/lib/today-query";

/** The Today query against the database. */
export function loadToday(referenceDate: Date) {
  return runTodayQuery(referenceDate, {
    findActivePlacements: () => placementRepository.findActiveHydrated(),
    listEscalationContacts: () => escalationContactRepository.list(),
    recordHealthSnapshots: (snapshots) => healthSnapshotRepository.recordMany(snapshots),
  });
}
