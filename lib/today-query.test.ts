import type { RecordHealthSnapshotInput } from "@callsheet/db/types";
import { describe, expect, it } from "vitest";

import { buildDemoData, demoPlacementsOn } from "@/lib/demo-data";
import { compareActions, operationalDay, type ScoringPlacement } from "@/lib/scoring";
import { runTodayQuery, type TodayRepositories } from "@/lib/today-query";

const DAY_MS = 86_400_000;

// Thursday 10 September 2026, 11:00 in New York.
const REFERENCE = new Date("2026-09-10T15:00:00Z");
const TODAY = operationalDay(REFERENCE);

const data = buildDemoData(REFERENCE);
const placements = demoPlacementsOn(data, TODAY);

function repositories(
  recordHealthSnapshots: TodayRepositories<ScoringPlacement>["recordHealthSnapshots"],
): TodayRepositories<ScoringPlacement> {
  return {
    findActivePlacements: async () => placements,
    listEscalationContacts: async () => data.escalationContacts,
    recordHealthSnapshots,
  };
}

describe("the Today query", () => {
  it("records today's health for every active placement", async () => {
    const recorded: RecordHealthSnapshotInput[] = [];
    const result = await runTodayQuery(
      REFERENCE,
      repositories(async (snapshots) => {
        recorded.push(...snapshots);
      }),
    );

    expect(result.day).toBe(TODAY);
    expect(recorded).toHaveLength(placements.length);
    expect(recorded).toEqual(
      result.placements.map(({ placement, score }) => ({
        placementId: placement.id,
        day: new Date(TODAY * DAY_MS),
        status: score.health,
        score: score.score,
      })),
    );
  });

  it("does not return until the snapshots are written", async () => {
    let written = false;
    await runTodayQuery(
      REFERENCE,
      repositories(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        written = true;
      }),
    );
    expect(written).toBe(true);
  });

  it("returns every action across placements, ranked", async () => {
    const result = await runTodayQuery(REFERENCE, repositories(async () => undefined));
    const total = result.placements.reduce((count, { score }) => count + score.actions.length, 0);

    expect(result.actions).toHaveLength(total);
    for (let i = 1; i < result.actions.length; i++) {
      expect(compareActions(result.actions[i - 1], result.actions[i])).toBeLessThanOrEqual(0);
    }
    expect(result.actions[0].type).toBe("ESCALATION");
  });
});
