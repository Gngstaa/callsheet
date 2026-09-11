import { describe, expect, it } from "vitest";

import { buildDemoData, demoPlacementsOn } from "@/lib/demo-data";
import { operationalDay, scorePlacement, type ScoringPlacement } from "@/lib/scoring";
import { runTodayQuery } from "@/lib/today-query";
import {
  buildTodayView,
  contextLine,
  emptyPlacementRows,
  LATER_WINDOW_DAYS,
  NOTHING_COMING_UP,
  placementRows,
  todayGroups,
  withPlacementRows,
} from "@/lib/today-view";

const DAY_MS = 86_400_000;
const NBSP = String.fromCharCode(160);

// Thursday 10 September 2026, 11:00 in New York. All names are invented.
const REFERENCE = new Date("2026-09-10T15:00:00Z");
const TODAY = operationalDay(REFERENCE);

const data = buildDemoData(REFERENCE);
const demoPlacements = demoPlacementsOn(data, TODAY);

async function viewOf(placements: readonly ScoringPlacement[]) {
  const result = await runTodayQuery(
    REFERENCE,
    {
      findActivePlacements: async () => placements,
      listEscalationContacts: async () => data.escalationContacts,
      recordHealthSnapshots: async () => undefined,
    },
    { defer: () => undefined },
  );
  const view = buildTodayView(result);
  return { result, view, groups: todayGroups(view) };
}

const demo = viewOf(demoPlacements);

function demoPlacement(professional: string): ScoringPlacement {
  const placement = demoPlacements.find((p) => p.professional.name === professional);
  if (!placement) throw new Error(`No demo placement for ${professional}`);
  return placement;
}

describe("the Today view", () => {
  it("puts escalations under Escalate now, naming the rule and who it goes to", async () => {
    const { groups } = await demo;
    expect(groups.escalateNow.map((row) => [row.professional, row.severity, row.escalationLine])).toEqual([
      ["Jerome Aquino", "alert", `Fix did not hold at a follow-up check${NBSP}— needs${NBSP}Vikram${NBSP}Iyer.`],
      ["Siddharth Bhosale", "alert", `Red for seven days running${NBSP}— needs${NBSP}Nandini${NBSP}Rao.`],
    ]);
  });

  it("marks Call today rows by their placement's health", async () => {
    const { groups } = await demo;
    const severity = new Map(groups.callToday.map((row) => [row.professional, row.severity]));
    // Amber: silent 45 days. Green: feedback due today.
    expect(severity.get("Ashwini Shinde")).toBe("watch");
    expect(severity.get("Yash Pawar")).toBe("routine");
    expect(groups.callToday.every((row) => row.escalationLine === null)).toBe(true);
  });

  it("keeps Later this week to the next six days", async () => {
    const { result, groups } = await demo;
    expect(groups.laterThisWeek.length).toBeGreaterThan(0);
    expect(groups.laterThisWeek).toHaveLength(
      result.upcoming.filter((item) => item.daysAway <= LATER_WINDOW_DAYS).length,
    );
    expect(groups.laterThisWeek.every((row) => row.severity === "routine")).toBe(true);
  });

  it("never repeats a row's heading in its reason", async () => {
    const { groups } = await demo;
    for (const row of [...groups.escalateNow, ...groups.callToday, ...groups.laterThisWeek]) {
      expect(row.reason).not.toContain(row.professional);
    }
  });

  it("gives every row its own key", async () => {
    const { groups } = await demo;
    const keys = [...groups.escalateNow, ...groups.callToday, ...groups.laterThisWeek].map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("wires each row to the action for its kind", async () => {
    const { groups } = await demo;
    const actionOf = (professional: string) =>
      groups.callToday.find((row) => row.professional === professional)?.action;

    expect(groups.escalateNow[0].action).toMatchObject({ kind: "escalate", rule: "REGRESSED_FOLLOW_UP" });
    expect(actionOf("Jasmine Villanueva")).toMatchObject({ kind: "feedback", contactName: "Karen Holt" });
    expect(actionOf("Harshil Vora")).toMatchObject({ kind: "followUp" });
    // Feedback due today and a professional check-in overdue: two rows, two actions.
    expect(
      groups.callToday.filter((row) => row.professional === "Kedar Paranjpe").map((row) => row.action.kind).sort(),
    ).toEqual(["checkIn", "feedback"]);
  });

  it("lists a check-in due today under Call today with no rule, even on an amber placement", async () => {
    const amber: ScoringPlacement = {
      id: "placement-amber",
      status: "ACTIVE",
      startDate: new Date((TODAY - 200) * DAY_MS),
      client: { name: "Silver Creek Orthopedics", contactName: "Andrew Lowe" },
      professional: { name: "Ashwini Shinde" },
      feedbackEntries: [{ party: "CLIENT", collectedAt: new Date(REFERENCE.getTime() - 45 * DAY_MS), sentiment: 4 }],
      issues: [],
      checkIns: [{ id: "check-in-today", party: "CLIENT", dueOn: new Date(TODAY * DAY_MS), completedAt: null }],
      escalations: [],
      healthSnapshots: [],
    };
    const { groups } = await viewOf([amber]);

    expect(groups.callToday.map((row) => [row.reason, row.severity])).toEqual([
      ["No feedback from Andrew Lowe in 45 days, and feedback is due every month.", "watch"],
      ["Monthly check-in with Andrew Lowe is due today.", "routine"],
    ]);
    expect(groups.laterThisWeek.map((row) => row.reason)).not.toContain("Monthly check-in with Andrew Lowe is due today.");
    expect(groups.nextUp).not.toContain("today");
  });

  it("says what is next when nothing is due today", async () => {
    const quiet: ScoringPlacement = {
      id: "placement-quiet",
      status: "ACTIVE",
      startDate: new Date((TODAY - 200) * DAY_MS),
      client: { name: "Harborview Insurance Group", contactName: "Amanda Fox" },
      professional: { name: "Hetal Rajyaguru" },
      feedbackEntries: [{ party: "CLIENT", collectedAt: new Date(REFERENCE.getTime() - 3 * DAY_MS), sentiment: 4 }],
      issues: [],
      checkIns: [{ id: "check-in-1", party: "CLIENT", dueOn: new Date((TODAY + 2) * DAY_MS), completedAt: null }],
      escalations: [],
      healthSnapshots: [],
    };
    const { groups } = await viewOf([quiet]);

    expect(groups.escalateNow).toEqual([]);
    expect(groups.callToday).toEqual([]);
    expect(groups.nextUp).toBe("Next up: Hetal Rajyaguru at Harborview Insurance Group, client check-in due Saturday.");
  });

  it("knows when there is nothing loaded at all", async () => {
    const { view, groups } = await viewOf([]);
    expect(view.placementIds).toEqual([]);
    expect(groups.nextUp).toBe(NOTHING_COMING_UP);
  });

  it.each([
    [9, true, "Northfield Pediatrics, day 9 of trial"],
    [0, true, "Northfield Pediatrics, first day of trial"],
    [410, false, "Northfield Pediatrics, 13 months in"],
  ])("describes day %i as a phrase", (dayIndex, inTrial, line) => {
    expect(contextLine("Northfield Pediatrics", { dayIndex, inTrial })).toBe(line);
  });
});

describe("swapping in one placement after a row action", () => {
  // The server re-scores only the touched placement. The list that results
  // must be exactly what re-running the Today query for every placement gives.
  async function swapAndRerun(professional: string, change: (placement: ScoringPlacement) => ScoringPlacement) {
    const { view } = await demo;
    const target = demoPlacement(professional);
    const changed = change(target);

    const swapped = withPlacementRows(
      view,
      placementRows(changed, scorePlacement(changed, { referenceDate: REFERENCE, contacts: data.escalationContacts })),
    );
    const rerun = await viewOf(demoPlacements.map((p) => (p.id === target.id ? changed : p)));
    return { swapped: todayGroups(swapped), rerun: rerun.groups };
  }

  it("matches a full re-run after a check-in is logged", async () => {
    const { swapped, rerun } = await swapAndRerun("Nirav Dholakia", (placement) => ({
      ...placement,
      checkIns: placement.checkIns.map((checkIn) =>
        checkIn.completedAt === null && checkIn.dueOn.getTime() <= TODAY * DAY_MS
          ? { ...checkIn, completedAt: REFERENCE }
          : checkIn,
      ),
    }));

    expect(swapped).toEqual(rerun);
    expect(swapped.callToday.map((row) => row.professional)).not.toContain("Nirav Dholakia");
  });

  it("matches a full re-run when a follow-up comes back and new escalations appear", async () => {
    const { swapped, rerun } = await swapAndRerun("Ketan Parmar", (placement) => ({
      ...placement,
      issues: placement.issues.map((issue) => ({
        ...issue,
        followUps: issue.followUps.map((followUp) =>
          followUp.offsetDays === 21 && followUp.checkedAt === null && followUp.dueAt <= REFERENCE
            ? { ...followUp, checkedAt: REFERENCE, outcome: "REGRESSED" as const }
            : followUp,
        ),
      })),
    }));

    expect(swapped).toEqual(rerun);
    expect(swapped.escalateNow).toHaveLength(4);
  });

  it("drops every row for a placement that shows nothing any more", async () => {
    const { view } = await demo;
    const target = demoPlacement("Ketan Parmar");
    const groups = todayGroups(withPlacementRows(view, emptyPlacementRows(target.id)));
    const everyRow = [...groups.escalateNow, ...groups.callToday, ...groups.laterThisWeek];
    expect(everyRow.some((row) => row.placementId === target.id)).toBe(false);
  });
});
