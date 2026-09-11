import type { RecordHealthSnapshotInput } from "@callsheet/db/types";
import { describe, expect, it } from "vitest";

import { buildDemoData, demoPlacementsOn } from "@/lib/demo-data";
import {
  compareActions,
  compareUpcoming,
  operationalDay,
  type ScoringPlacement,
} from "@/lib/scoring";
import { runTodayQuery, type TodayRepositories } from "@/lib/today-query";

const DAY_MS = 86_400_000;

// Thursday 10 September 2026, 11:00 in New York.
const REFERENCE = new Date("2026-09-10T15:00:00Z");
const TODAY = operationalDay(REFERENCE);

const data = buildDemoData(REFERENCE);
const placements = demoPlacementsOn(data, TODAY);

function repositories(
  list: readonly ScoringPlacement[],
  recordHealthSnapshots: TodayRepositories<ScoringPlacement>["recordHealthSnapshots"] = async () => undefined,
): TodayRepositories<ScoringPlacement> {
  return {
    findActivePlacements: async () => list,
    listEscalationContacts: async () => data.escalationContacts,
    recordHealthSnapshots,
  };
}

const runNow = { defer: () => undefined };

describe("the Today query", () => {
  it("returns the list before today's health snapshot is written, and hands the write off", async () => {
    const recorded: RecordHealthSnapshotInput[] = [];
    const deferred: (() => Promise<void>)[] = [];

    const result = await runTodayQuery(
      REFERENCE,
      repositories(placements, async (snapshots) => {
        recorded.push(...snapshots);
      }),
      {
        defer: (task) => {
          deferred.push(task);
        },
      },
    );

    expect(result.day).toBe(TODAY);
    expect(recorded).toEqual([]);
    expect(deferred).toHaveLength(1);

    await deferred[0]();
    expect(recorded).toEqual(
      result.placements.map(({ placement, score }) => ({
        placementId: placement.id,
        day: new Date(TODAY * DAY_MS),
        status: score.health,
        score: score.score,
      })),
    );
  });

  it("scores the same whether or not today's snapshot is already written", async () => {
    const withTodayRed = placements.map((placement) => ({
      ...placement,
      healthSnapshots: [...placement.healthSnapshots, { day: new Date(TODAY * DAY_MS), status: "RED" as const }],
    }));

    const before = await runTodayQuery(REFERENCE, repositories(placements), runNow);
    const after = await runTodayQuery(REFERENCE, repositories(withTodayRed), runNow);

    expect(after.actions).toEqual(before.actions);
    expect(after.placements.map(({ score }) => score)).toEqual(before.placements.map(({ score }) => score));
  });

  it.each([0, 1, 2, 5, 9])(
    "scores the trimmed rows the placement query loads exactly as the full rows, %i days back",
    async (daysBack) => {
      // Mirrors hydratedPlacementInclude in placement.repository.ts: client
      // feedback only, open check-ins only, red snapshots only.
      const day = TODAY - daysBack;
      const referenceDate = new Date(REFERENCE.getTime() - daysBack * DAY_MS);
      const full = demoPlacementsOn(data, day);
      const trimmed = full.map((placement) => ({
        ...placement,
        feedbackEntries: placement.feedbackEntries.filter((entry) => entry.party === "CLIENT"),
        checkIns: placement.checkIns.filter((checkIn) => checkIn.completedAt === null),
        healthSnapshots: placement.healthSnapshots.filter((snapshot) => snapshot.status === "RED"),
      }));

      const fromFull = await runTodayQuery(referenceDate, repositories(full), runNow);
      const fromTrimmed = await runTodayQuery(referenceDate, repositories(trimmed), runNow);

      expect(fromTrimmed.placements.map(({ score }) => score)).toEqual(fromFull.placements.map(({ score }) => score));
    },
  );

  it("returns every action and everything coming up, each ranked", async () => {
    const result = await runTodayQuery(REFERENCE, repositories(placements), runNow);

    const actionCount = result.placements.reduce((count, { score }) => count + score.actions.length, 0);
    expect(result.actions).toHaveLength(actionCount);
    for (let i = 1; i < result.actions.length; i++) {
      expect(compareActions(result.actions[i - 1], result.actions[i])).toBeLessThanOrEqual(0);
    }
    expect(result.actions[0].type).toBe("ESCALATION");

    const upcomingCount = result.placements.reduce((count, { score }) => count + score.upcoming.length, 0);
    expect(result.upcoming).toHaveLength(upcomingCount);
    for (let i = 1; i < result.upcoming.length; i++) {
      expect(compareUpcoming(result.upcoming[i - 1], result.upcoming[i])).toBeLessThanOrEqual(0);
    }
  });
});
