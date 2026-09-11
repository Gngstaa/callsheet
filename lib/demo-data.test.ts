import type { IssueFollowUp } from "@callsheet/db/types";
import { describe, expect, it } from "vitest";

import {
  buildDemoData,
  demoPlacementsOn,
  HEALTH_HISTORY_DAYS,
  type DemoDataset,
} from "@/lib/demo-data";
import { operationalDay, scorePlacement } from "@/lib/scoring";

const DAY_MS = 86_400_000;

// Thursday 10 September 2026, 11:00 in New York.
const REFERENCE = new Date("2026-09-10T15:00:00Z");
const TODAY = operationalDay(REFERENCE);

const data = buildDemoData(REFERENCE);

function scoreOn(dataset: DemoDataset, referenceDate: Date) {
  return demoPlacementsOn(dataset, operationalDay(referenceDate)).map((placement) => ({
    placement,
    result: scorePlacement(placement, { referenceDate, contacts: dataset.escalationContacts }),
  }));
}

type Scored = ReturnType<typeof scoreOn>[number];

const today = scoreOn(data, REFERENCE);

const calendarDay = (date: Date) => Math.floor(date.getTime() / DAY_MS);

function one<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  return items[0];
}

function pendingRules({ result }: Scored) {
  return result.actions.flatMap((action) => (action.escalation ? [action.escalation.rule] : []));
}

function scoredPlacement(placementId: string): Scored {
  return one(today.filter(({ placement }) => placement.id === placementId));
}

function followUpsOf(issueId: string): IssueFollowUp[] {
  return data.issueFollowUps
    .filter((followUp) => followUp.issueId === issueId)
    .sort((a, b) => a.offsetDays - b.offsetDays);
}

describe("demo data covers SPEC.md's sample data", () => {
  it("has 32 active placements across 24 clients", () => {
    expect(data.placements).toHaveLength(32);
    expect(data.placements.every((placement) => placement.status === "ACTIVE")).toBe(true);
    expect(data.clients).toHaveLength(24);
    expect(new Set(data.placements.map((placement) => placement.clientId))).toEqual(
      new Set(data.clients.map((client) => client.id)),
    );
  });

  it("has three placements in days 1-14, one with no feedback logged at all", () => {
    const young = today.filter(({ result }) => result.dayIndex >= 1 && result.dayIndex <= 14);
    expect(young).toHaveLength(3);
    const withoutFeedback = young.filter(
      ({ placement }) => !data.feedbackEntries.some((entry) => entry.placementId === placement.id),
    );
    expect(withoutFeedback).toHaveLength(1);
  });

  it("reads a post-trial placement silent 45 days against a 30-day cadence as amber", () => {
    const { result } = one(
      today.filter(({ result }) => !result.inTrial && result.daysSinceClientFeedback === 45),
    );
    expect(result.feedbackCadenceDays).toBe(30);
    expect(result.health).toBe("AMBER");
  });

  it("reads a placement silent 68 days as red", () => {
    const { result } = one(today.filter(({ result }) => result.daysSinceClientFeedback === 68));
    expect(result.health).toBe("RED");
  });

  it("has two placements tripping different escalation rules", () => {
    const escalating = today.filter((entry) => pendingRules(entry).length > 0);
    expect(escalating.length).toBeGreaterThanOrEqual(2);
    expect(new Set(escalating.flatMap(pendingRules)).size).toBeGreaterThanOrEqual(2);
  });

  it("fires rule 4 on the placement silent 68 days", () => {
    const redForAWeek = today.filter((entry) => pendingRules(entry).includes("RED_SEVEN_DAYS"));
    expect(redForAWeek.map(({ result }) => result.daysSinceClientFeedback)).toEqual([68]);
  });

  it("has an issue fixed 22 days ago whose 21-day check regressed, reopening and escalating it", () => {
    const issue = one(
      data.issues.filter((i) => i.fixedAt !== null && operationalDay(i.fixedAt) === TODAY - 22),
    );
    expect(issue.status).toBe("REGRESSED");
    expect(followUpsOf(issue.id).map((followUp) => followUp.outcome)).toEqual(["HELD", "REGRESSED", null]);
    expect(pendingRules(scoredPlacement(issue.placementId))).toContain("REGRESSED_FOLLOW_UP");
  });

  it("has an issue fixed 50 days ago, closed after all three checks held", () => {
    const issue = one(
      data.issues.filter((i) => i.fixedAt !== null && operationalDay(i.fixedAt) === TODAY - 50),
    );
    expect(issue.status).toBe("CLOSED");
    expect(followUpsOf(issue.id).map((followUp) => followUp.outcome)).toEqual(["HELD", "HELD", "HELD"]);
  });

  it("has four attendance issues, two of them a repeat pair inside 30 days", () => {
    const attendance = data.issues.filter((issue) => issue.type === "ATTENDANCE");
    expect(attendance).toHaveLength(4);

    const reportedDays = new Map<string, number[]>();
    for (const issue of attendance) {
      reportedDays.set(issue.placementId, [
        ...(reportedDays.get(issue.placementId) ?? []),
        operationalDay(issue.reportedAt),
      ]);
    }
    const repeats = [...reportedDays.values()].flatMap((days) => {
      const sorted = [...days].sort((a, b) => a - b);
      return sorted.slice(1).filter((day, i) => day - sorted[i] <= 30);
    });
    expect(repeats).toHaveLength(1);
  });

  it("is roughly 60% green", () => {
    const green = today.filter(({ result }) => result.health === "GREEN").length / today.length;
    expect(green).toBeGreaterThanOrEqual(0.55);
    expect(green).toBeLessThanOrEqual(0.65);
  });

  it("has an escalation contact for each role", () => {
    expect(data.escalationContacts.map((contact) => contact.role).sort()).toEqual([
      "ACCOUNT_DIRECTOR",
      "DELIVERY_MANAGER",
    ]);
  });
});

describe("demo health history", () => {
  it("covers the 90 days before today, or every day since the start", () => {
    for (const placement of data.placements) {
      const days = data.healthSnapshots
        .filter((snapshot) => snapshot.placementId === placement.id)
        .map((snapshot) => calendarDay(snapshot.day))
        .sort((a, b) => a - b);
      const first = Math.max(calendarDay(placement.startDate), TODAY - HEALTH_HISTORY_DAYS);
      expect(days).toEqual(Array.from({ length: TODAY - first }, (_, i) => first + i));
    }
  });

  it("agrees with the engine about yesterday", () => {
    const yesterday = new Date(REFERENCE.getTime() - DAY_MS);
    for (const { placement, result } of scoreOn(data, yesterday)) {
      const snapshot = one(
        data.healthSnapshots.filter(
          (s) => s.placementId === placement.id && calendarDay(s.day) === TODAY - 1,
        ),
      );
      expect(snapshot).toMatchObject({ status: result.health, score: result.score });
    }
  });
});

describe("rebuilding the demo data", () => {
  it("gives identical rows for the same reference date", () => {
    expect(buildDemoData(REFERENCE)).toEqual(data);
  });

  it("gives the same situations on a later day, across a daylight saving change", () => {
    const later = new Date(REFERENCE.getTime() + 60 * DAY_MS);
    const summarise = (entries: readonly Scored[]) =>
      entries.map(({ placement, result }) => ({
        id: placement.id,
        dayIndex: result.dayIndex,
        health: result.health,
        score: result.score,
        reasons: result.actions.map((action) => action.reason),
      }));
    expect(summarise(scoreOn(buildDemoData(later), later))).toEqual(summarise(today));
  });

  it("uses unique ids and only points at rows that exist", () => {
    const tables: readonly (readonly { id: string }[])[] = [
      data.escalationContacts,
      data.clients,
      data.professionals,
      data.placements,
      data.feedbackEntries,
      data.issues,
      data.issueFollowUps,
      data.checkIns,
      data.actionLogs,
      data.escalations,
      data.healthSnapshots,
    ];
    for (const rows of tables) {
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    }

    const ids = (rows: readonly { id: string }[]) => new Set(rows.map((row) => row.id));
    const clients = ids(data.clients);
    const professionals = ids(data.professionals);
    const placements = ids(data.placements);
    const issues = ids(data.issues);
    const contacts = ids(data.escalationContacts);

    for (const placement of data.placements) {
      expect(clients.has(placement.clientId)).toBe(true);
      expect(professionals.has(placement.professionalId)).toBe(true);
    }
    const children = [
      ...data.feedbackEntries,
      ...data.issues,
      ...data.checkIns,
      ...data.actionLogs,
      ...data.escalations,
      ...data.healthSnapshots,
    ];
    for (const row of children) expect(placements.has(row.placementId)).toBe(true);
    for (const followUp of data.issueFollowUps) expect(issues.has(followUp.issueId)).toBe(true);
    for (const escalation of data.escalations) {
      expect(contacts.has(escalation.contactId)).toBe(true);
      if (escalation.issueId) expect(issues.has(escalation.issueId)).toBe(true);
    }
  });
});
