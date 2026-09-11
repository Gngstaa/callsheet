import { readFileSync } from "node:fs";

import type {
  ActionType,
  EscalationContact,
  HydratedPlacement,
  IssueStatus,
  Reporter,
} from "@callsheet/db/types";
import { describe, expect, expectTypeOf, it } from "vitest";

import { ESCALATION_ROUTES } from "@/lib/escalation-routes";
import {
  compareActions,
  operationalDay,
  scorePlacement,
  type PlacementScore,
  type ScoredAction,
  type ScoringContact,
  type ScoringIssue,
  type ScoringPlacement,
} from "@/lib/scoring";

// All names here are invented.

const DAY_MS = 86_400_000;

// Thursday 10 September 2026, 11:00 in New York.
const REFERENCE = new Date("2026-09-10T15:00:00Z");
const REFERENCE_DAY = Date.UTC(2026, 8, 10) / DAY_MS;

/** An instant around 11:00 New York time, `offset` days from the reference day. */
const at = (offset: number) => new Date(REFERENCE.getTime() + offset * DAY_MS);

/** A `date` column value, `offset` days from the reference day. */
const date = (offset: number) => new Date((REFERENCE_DAY + offset) * DAY_MS);

const accountDirector: ScoringContact = {
  id: "contact-ad",
  name: "Nandini Rao",
  role: "ACCOUNT_DIRECTOR",
};
const deliveryManager: ScoringContact = {
  id: "contact-dm",
  name: "Joel Santos",
  role: "DELIVERY_MANAGER",
};

/** Post-trial (day 200), client feedback 3 days ago rated 4, nothing else going on. */
function placement(overrides: Partial<ScoringPlacement> = {}): ScoringPlacement {
  return {
    id: "placement-1",
    status: "ACTIVE",
    startDate: date(-200),
    client: { name: "Lakeshore Architecture Studio", contactName: "Dana Whitfield" },
    professional: { name: "Aniket Kulkarni" },
    feedbackEntries: [clientFeedback(-3)],
    issues: [],
    checkIns: [],
    actionLogs: [],
    escalations: [],
    healthSnapshots: [],
    ...overrides,
  };
}

const onDay = (dayIndex: number) => ({ startDate: date(-dayIndex) });

function clientFeedback(offset: number, sentiment = 4) {
  return { party: "CLIENT" as const, collectedAt: at(offset), sentiment };
}

function issue(fields: Pick<ScoringIssue, "id" | "type"> & Partial<ScoringIssue>): ScoringIssue {
  return { status: "OPEN", reportedAt: at(-5), reportedBy: "CLIENT", followUps: [], ...fields };
}

function score(
  p: ScoringPlacement,
  {
    referenceDate = REFERENCE,
    contacts = [accountDirector, deliveryManager],
  }: { referenceDate?: Date; contacts?: readonly ScoringContact[] } = {},
): PlacementScore {
  return scorePlacement(p, { referenceDate, contacts });
}

function only(result: PlacementScore, type: ActionType): ScoredAction {
  const matches = result.actions.filter((action) => action.type === type);
  expect(matches).toHaveLength(1);
  return matches[0];
}

function pointsFor(result: PlacementScore, label: string): number | undefined {
  return result.components.find((component) => component.label === label)?.points;
}

describe("operational day", () => {
  it("keeps 10:30pm in New York on the same day, though it is next morning in IST", () => {
    expect(operationalDay(new Date("2026-09-11T02:30:00Z"))).toBe(REFERENCE_DAY);
    expect(operationalDay(new Date("2026-09-11T04:30:00Z"))).toBe(REFERENCE_DAY + 1);
  });

  it("does not move an overdue count mid-shift when IST rolls over", () => {
    const checkIns = [{ id: "check-in-1", party: "CLIENT" as const, dueOn: date(-1), completedAt: null }];
    const midShift = score(placement({ checkIns }), {
      referenceDate: new Date("2026-09-11T02:30:00Z"),
    });
    expect(only(midShift, "CHECKIN_DUE").reason).toBe(
      "Monthly check-in with Dana Whitfield is 1 day overdue.",
    );
  });
});

describe("trial weighting", () => {
  const overdueCheckIn = { id: "check-in-1", party: "CLIENT" as const, dueOn: date(-1), completedAt: null };

  it.each([
    [0, 30],
    [14, 30],
    [15, 20],
    [45, 20],
    [46, 10],
    [90, 10],
    [91, 0],
  ])("day %i adds %i", (dayIndex, weight) => {
    const result = score(
      placement({ ...onDay(dayIndex), feedbackEntries: [clientFeedback(0)], checkIns: [overdueCheckIn] }),
    );
    expect(only(result, "CHECKIN_DUE").score).toBe(weight + 10);
  });

  it("applies to every action on the placement", () => {
    const result = score(
      placement({
        ...onDay(20),
        feedbackEntries: [clientFeedback(0)],
        checkIns: [overdueCheckIn],
        issues: [
          issue({
            id: "issue-1",
            type: "UNDERPERFORMANCE",
            status: "FIXED",
            followUps: [{ id: "follow-up-7", offsetDays: 7, dueAt: at(0), checkedAt: null, outcome: null }],
          }),
        ],
      }),
    );
    expect(only(result, "CHECKIN_DUE").score).toBe(20 + 10);
    expect(only(result, "ISSUE_FOLLOWUP").score).toBe(20 + 20);
  });
});

describe("silence", () => {
  const silentFor = (daysSilent: number) =>
    score(placement({ feedbackEntries: [clientFeedback(-daysSilent)] }));

  it("scores nothing before the cadence runs out", () => {
    const result = silentFor(26);
    expect(result.actions).toEqual([]);
    expect(result.health).toBe("GREEN");
  });

  it("makes feedback due on the day the cadence runs out", () => {
    const action = only(silentFor(30), "FEEDBACK_DUE");
    expect(action.score).toBe(20);
    expect(action.reason).toBe("Feedback from Dana Whitfield is due today.");
  });

  it.each([
    [31, 20],
    [44, 20],
    [45, 40],
    [59, 40],
    [60, 50],
    [68, 50],
  ])("scores %i silent days against a 30-day cadence at %i", (daysSilent, points) => {
    expect(only(silentFor(daysSilent), "SILENCE").score).toBe(points);
  });

  it("reads a post-trial placement silent 45 days as amber on silence alone", () => {
    const result = silentFor(45);
    expect(result.score).toBe(40);
    expect(result.health).toBe("AMBER");
  });

  it("goes red at twice the cadence, whatever the score", () => {
    const result = silentFor(60);
    expect(result.score).toBe(50);
    expect(result.health).toBe("RED");
  });

  it("is not red at 1.97 times the cadence", () => {
    expect(silentFor(59).health).toBe("AMBER");
  });

  it("uses the tighter cadence during the trial", () => {
    const result = score(placement({ ...onDay(60), feedbackEntries: [clientFeedback(-21)] }));
    expect(result.feedbackCadenceDays).toBe(14);
    expect(only(result, "SILENCE").score).toBe(10 + 40);
  });

  it("says who has gone quiet and how often feedback is due", () => {
    expect(only(silentFor(31), "SILENCE").reason).toBe(
      "No feedback from Dana Whitfield in 31 days, and feedback is due every month.",
    );
  });

  it("outranks a single bad rating", () => {
    const silent = silentFor(60);
    const unhappy = score(placement({ feedbackEntries: [clientFeedback(-1, 2)] }));
    expect(silent.score).toBeGreaterThan(unhappy.score);
  });

  it("clears for the rest of the day once a call is logged", () => {
    const logged = (offset: number) =>
      score(
        placement({
          feedbackEntries: [clientFeedback(-40)],
          actionLogs: [{ actionType: "SILENCE", performedAt: at(offset) }],
        }),
      );
    expect(logged(0).actions).toEqual([]);
    expect(only(logged(-1), "SILENCE").score).toBe(20);
  });
});

describe("new placements", () => {
  it("flags day 9 with no client feedback once, not as silence too", () => {
    const result = score(placement({ ...onDay(9), feedbackEntries: [] }));
    expect(result.actions.map((action) => action.type)).toEqual(["NEW_PLACEMENT"]);
    const action = only(result, "NEW_PLACEMENT");
    expect(action.reason).toBe(
      "No feedback from Dana Whitfield since the placement started 9 days ago.",
    );
    // Day 1-14 weight plus 9 days against a 7-day cadence.
    expect(action.score).toBe(30 + 20);
  });

  it("waits until day 1", () => {
    expect(score(placement({ ...onDay(0), feedbackEntries: [] })).actions).toEqual([]);
  });

  it("does not count professional feedback as client feedback", () => {
    const result = score(
      placement({
        ...onDay(5),
        feedbackEntries: [{ party: "PROFESSIONAL", collectedAt: at(-1), sentiment: 5 }],
      }),
    );
    expect(only(result, "NEW_PLACEMENT").callee).toBe("Dana Whitfield");
  });
});

describe("open issues and sentiment", () => {
  it("adds 25 per open issue, capped at 50", () => {
    const withOpen = (count: number) =>
      score(
        placement({
          issues: Array.from({ length: count }, (_, i) =>
            issue({ id: `issue-${i}`, type: "UNDERPERFORMANCE" }),
          ),
        }),
      );
    expect(pointsFor(withOpen(1), "1 open issue")).toBe(25);
    expect(pointsFor(withOpen(3), "3 open issues")).toBe(50);
  });

  it("does not count fixed or closed issues as open", () => {
    const result = score(
      placement({
        issues: [
          issue({ id: "issue-1", type: "UNDERPERFORMANCE", status: "FIXED" }),
          issue({ id: "issue-2", type: "UNDERPERFORMANCE", status: "CLOSED" }),
        ],
      }),
    );
    expect(result.components).toEqual([]);
  });

  it("adds 25 when the last client rating is 2 or lower", () => {
    const ratedAt = (sentiment: number) =>
      score(placement({ feedbackEntries: [clientFeedback(-10, 5), clientFeedback(-1, sentiment)] }));
    expect(pointsFor(ratedAt(2), "Last client rating was 2 out of 5")).toBe(25);
    expect(ratedAt(3).components).toEqual([]);
  });
});

describe("issue follow-ups", () => {
  const fixedIssue = (overdue: number, reportedBy: Reporter = "CLIENT") =>
    placement({
      issues: [
        issue({
          id: "issue-1",
          type: "ATTENDANCE",
          status: "FIXED",
          reportedBy,
          followUps: [
            { id: "follow-up-7", offsetDays: 7, dueAt: at(-overdue), checkedAt: null, outcome: null },
          ],
        }),
      ],
    });

  it.each([
    [0, 20],
    [3, 20],
    [4, 35],
  ])("%i days overdue adds %i", (overdue, points) => {
    expect(only(score(fixedIssue(overdue)), "ISSUE_FOLLOWUP").score).toBe(points);
  });

  it("asks the client contact whether the fix is holding", () => {
    expect(only(score(fixedIssue(0)), "ISSUE_FOLLOWUP").reason).toBe(
      "Check with Dana Whitfield that the attendance issue is still resolved. The 7-day check is due today.",
    );
    expect(only(score(fixedIssue(4)), "ISSUE_FOLLOWUP").reason).toBe(
      "Check with Dana Whitfield that the attendance issue is still resolved. The 7-day check was due 4 days ago.",
    );
  });

  it("asks the professional when the professional reported the issue", () => {
    expect(only(score(fixedIssue(0, "PROFESSIONAL")), "ISSUE_FOLLOWUP").callee).toBe("Aniket Kulkarni");
  });

  it("ignores windows not yet due or already checked", () => {
    const result = score(
      placement({
        issues: [
          issue({
            id: "issue-1",
            type: "ATTENDANCE",
            status: "FIXED",
            followUps: [
              { id: "follow-up-7", offsetDays: 7, dueAt: at(-2), checkedAt: at(-1), outcome: "HELD" },
              { id: "follow-up-21", offsetDays: 21, dueAt: at(12), checkedAt: null, outcome: null },
            ],
          }),
        ],
      }),
    );
    expect(result.actions).toEqual([]);
  });
});

describe("check-ins", () => {
  const withCheckIn = (overdue: number, party: "CLIENT" | "PROFESSIONAL" = "CLIENT") =>
    score(placement({ checkIns: [{ id: "check-in-1", party, dueOn: date(-overdue), completedAt: null }] }));

  it("waits until the day after the due day", () => {
    expect(withCheckIn(0).actions).toEqual([]);
  });

  it.each([
    [1, 10],
    [6, 10],
    [7, 20],
  ])("%i days overdue adds %i", (overdue, points) => {
    expect(only(withCheckIn(overdue), "CHECKIN_DUE").score).toBe(points);
  });

  it("names the professional for a professional check-in", () => {
    expect(only(withCheckIn(7, "PROFESSIONAL"), "CHECKIN_DUE").reason).toBe(
      "Monthly check-in with Aniket Kulkarni is 7 days overdue.",
    );
  });
});

describe("escalation rules", () => {
  it("route the way SPEC.md says", () => {
    expect(ESCALATION_ROUTES).toEqual({
      TWO_OPEN_ISSUES: "ACCOUNT_DIRECTOR",
      TRIAL_CLIENT_COMPLAINT: "ACCOUNT_DIRECTOR",
      RED_SEVEN_DAYS: "ACCOUNT_DIRECTOR",
      REPLACEMENT_REQUEST: "ACCOUNT_DIRECTOR",
      REPEAT_ATTENDANCE: "DELIVERY_MANAGER",
      REGRESSED_FOLLOW_UP: "DELIVERY_MANAGER",
    });
  });

  describe("1. two or more open issues", () => {
    const twoOpen = [
      issue({ id: "issue-1", type: "UNDERPERFORMANCE", reportedAt: at(-6) }),
      issue({ id: "issue-2", type: "ATTENDANCE", reportedAt: at(-2) }),
    ];

    it("goes to the account director", () => {
      const result = score(placement({ issues: twoOpen }));
      const action = only(result, "ESCALATION");
      expect(action.escalation).toEqual({
        rule: "TWO_OPEN_ISSUES",
        ruleLabel: "Two or more open issues",
        role: "ACCOUNT_DIRECTOR",
        contact: accountDirector,
      });
      expect(action.reason).toBe(
        "Nandini Rao, the account director, needs to hear that Aniket Kulkarni has 2 open issues at Lakeshore Architecture Studio.",
      );
      // Open issues 50 plus escalation 60, clamped.
      expect(action.score).toBe(100);
      expect(result.health).toBe("RED");
    });

    it("clears once escalated, and trips again when another issue opens", () => {
      const escalations = [{ rule: "TWO_OPEN_ISSUES" as const, issueId: null, escalatedAt: at(-1) }];
      expect(score(placement({ issues: twoOpen, escalations })).actions).toEqual([]);

      const third = issue({ id: "issue-3", type: "UNDERPERFORMANCE", reportedAt: at(0) });
      const result = score(placement({ issues: [...twoOpen, third], escalations }));
      expect(only(result, "ESCALATION").escalation?.rule).toBe("TWO_OPEN_ISSUES");
    });
  });

  describe("2. client complaint during the trial", () => {
    const complaint = (reportedOnDay: number, status: IssueStatus) =>
      placement({
        ...onDay(100),
        issues: [issue({ id: "issue-1", type: "CLIENT_COMPLAINT", status, reportedAt: at(reportedOnDay - 100) })],
      });

    it("goes to the account director, even once fixed", () => {
      const action = only(score(complaint(80, "FIXED")), "ESCALATION");
      expect(action.escalation?.rule).toBe("TRIAL_CLIENT_COMPLAINT");
      expect(action.reason).toBe(
        "Nandini Rao, the account director, needs to hear that Lakeshore Architecture Studio raised a complaint on day 80 of the trial.",
      );
    });

    it("does not trip after the trial or once closed", () => {
      expect(score(complaint(95, "OPEN")).actions.map((a) => a.type)).not.toContain("ESCALATION");
      expect(score(complaint(80, "CLOSED")).actions).toEqual([]);
    });
  });

  describe("3. repeat attendance issue", () => {
    const attendancePair = (gap: number) =>
      placement({
        issues: [
          issue({ id: "issue-1", type: "ATTENDANCE", status: "FIXED", reportedAt: at(-2 - gap) }),
          issue({ id: "issue-2", type: "ATTENDANCE", reportedAt: at(-2) }),
        ],
      });

    it("goes to the delivery manager", () => {
      const action = only(score(attendancePair(12)), "ESCALATION");
      expect(action.escalation).toMatchObject({ rule: "REPEAT_ATTENDANCE", contact: deliveryManager });
      expect(action.issueId).toBe("issue-2");
      expect(action.reason).toBe(
        "Joel Santos, the delivery manager, needs to hear that Aniket Kulkarni had a second attendance issue 12 days after the one before.",
      );
    });

    it.each([
      [30, true],
      [31, false],
    ])("with %i days between them trips: %s", (gap, trips) => {
      const types = score(attendancePair(gap)).actions.map((a) => a.type);
      expect(types.includes("ESCALATION")).toBe(trips);
    });
  });

  describe("4. red for seven days", () => {
    const redOn = (...offsets: number[]) =>
      offsets.map((offset) => ({ day: date(offset), status: "RED" as const }));
    // Silent for twice the cadence, so red today.
    const redToday = (overrides: Partial<ScoringPlacement>) =>
      score(placement({ feedbackEntries: [clientFeedback(-60)], ...overrides }));

    it("goes to the account director", () => {
      const result = redToday({ healthSnapshots: redOn(-1, -2, -3, -4, -5, -6) });
      const action = only(result, "ESCALATION");
      expect(action.escalation).toMatchObject({ rule: "RED_SEVEN_DAYS", contact: accountDirector });
      expect(action.reason).toBe(
        "Nandini Rao, the account director, needs to hear that Aniket Kulkarni's placement at Lakeshore Architecture Studio has been red for 7 days.",
      );
    });

    it("does not trip at six days or across a gap", () => {
      const types = (snapshots: ReturnType<typeof redOn>) =>
        redToday({ healthSnapshots: snapshots }).actions.map((a) => a.type);
      expect(types(redOn(-1, -2, -3, -4, -5))).not.toContain("ESCALATION");
      expect(types(redOn(-1, -2, -4, -5, -6, -7))).not.toContain("ESCALATION");
    });

    it("clears once escalated during the current streak", () => {
      const result = redToday({
        healthSnapshots: redOn(-1, -2, -3, -4, -5, -6),
        escalations: [{ rule: "RED_SEVEN_DAYS", issueId: null, escalatedAt: at(-2) }],
      });
      expect(result.actions.map((a) => a.type)).not.toContain("ESCALATION");
    });
  });

  describe("5. replacement request", () => {
    it("goes to the account director", () => {
      const result = score(
        placement({ issues: [issue({ id: "issue-1", type: "REPLACEMENT_REQUEST" })] }),
      );
      const action = only(result, "ESCALATION");
      expect(action.escalation).toMatchObject({ rule: "REPLACEMENT_REQUEST", contact: accountDirector });
      expect(action.reason).toBe(
        "Nandini Rao, the account director, needs to hear that Lakeshore Architecture Studio asked to replace Aniket Kulkarni.",
      );
    });
  });

  describe("6. regressed follow-up", () => {
    // SPEC.md seed case: fixed 22 days ago, the 21-day check came back REGRESSED.
    const regressed = (status: IssueStatus, escalations: ScoringPlacement["escalations"] = []) =>
      placement({
        escalations,
        checkIns: [{ id: "check-in-1", party: "CLIENT", dueOn: date(-2), completedAt: null }],
        issues: [
          issue({
            id: "issue-1",
            type: "ATTENDANCE",
            status,
            reportedAt: at(-30),
            followUps: [
              { id: "follow-up-7", offsetDays: 7, dueAt: at(-15), checkedAt: at(-15), outcome: "HELD" },
              { id: "follow-up-21", offsetDays: 21, dueAt: at(-1), checkedAt: at(-1), outcome: "REGRESSED" },
              { id: "follow-up-45", offsetDays: 45, dueAt: at(23), checkedAt: null, outcome: null },
            ],
          }),
        ],
      });

    it("reopens its issue, even before the status column is flipped", () => {
      const result = score(regressed("FIXED"));
      expect(pointsFor(result, "1 open issue")).toBe(25);
      expect(result.actions.map((a) => a.type)).not.toContain("ISSUE_FOLLOWUP");
    });

    it("goes to the delivery manager and floats to the top", () => {
      const result = score(regressed("FIXED"));
      const [first] = result.actions;
      expect(first.type).toBe("ESCALATION");
      expect(first.escalation).toMatchObject({ rule: "REGRESSED_FOLLOW_UP", contact: deliveryManager });
      expect(first.reason).toBe(
        "Joel Santos, the delivery manager, needs to hear that the attendance issue for Aniket Kulkarni came back at the 21-day check.",
      );
      expect(first.score).toBe(25 + 60);
      expect(result.health).toBe("RED");
    });

    it("gives the same answer once the repository has flipped the status", () => {
      expect(score(regressed("REGRESSED"))).toEqual(score(regressed("FIXED")));
    });

    it("clears once escalated after the regression", () => {
      const result = score(
        regressed("REGRESSED", [{ rule: "REGRESSED_FOLLOW_UP", issueId: "issue-1", escalatedAt: at(0) }]),
      );
      expect(result.actions.map((a) => a.type)).not.toContain("ESCALATION");
    });
  });

  it("names the role when nobody holds it yet", () => {
    const result = score(placement({ issues: [issue({ id: "issue-1", type: "REPLACEMENT_REQUEST" })] }), {
      contacts: [deliveryManager],
    });
    const action = only(result, "ESCALATION");
    expect(action.escalation?.contact).toBeNull();
    expect(action.reason).toBe(
      "The account director needs to hear that Lakeshore Architecture Studio asked to replace Aniket Kulkarni.",
    );
  });
});

describe("ranking", () => {
  it("puts the higher score first, and an escalation first on a tie", () => {
    const actions = [
      { type: "CHECKIN_DUE" as const, score: 60 },
      { type: "SILENCE" as const, score: 60 },
      { type: "ESCALATION" as const, score: 60 },
      { type: "FEEDBACK_DUE" as const, score: 80 },
    ];
    expect([...actions].sort(compareActions).map((a) => a.type)).toEqual([
      "FEEDBACK_DUE",
      "ESCALATION",
      "SILENCE",
      "CHECKIN_DUE",
    ]);
  });
});

describe("reason sentences", () => {
  const busy = [
    placement({ ...onDay(9), feedbackEntries: [] }),
    placement({ feedbackEntries: [clientFeedback(-30)] }),
    placement({
      ...onDay(120),
      feedbackEntries: [clientFeedback(-40, 2)],
      checkIns: [
        { id: "check-in-1", party: "CLIENT", dueOn: date(-8), completedAt: null },
        { id: "check-in-2", party: "PROFESSIONAL", dueOn: date(-2), completedAt: null },
      ],
      issues: [
        issue({ id: "issue-1", type: "REPLACEMENT_REQUEST" }),
        issue({ id: "issue-2", type: "CLIENT_COMPLAINT", reportedAt: at(-40) }),
        issue({ id: "issue-3", type: "ATTENDANCE", status: "FIXED", reportedAt: at(-40) }),
        issue({
          id: "issue-4",
          type: "ATTENDANCE",
          status: "FIXED",
          reportedBy: "PROFESSIONAL",
          reportedAt: at(-20),
          followUps: [{ id: "follow-up-7", offsetDays: 7, dueAt: at(-5), checkedAt: null, outcome: null }],
        }),
        issue({
          id: "issue-5",
          type: "UNDERPERFORMANCE",
          status: "REGRESSED",
          reportedAt: at(-50),
          followUps: [{ id: "follow-up-21", offsetDays: 21, dueAt: at(-4), checkedAt: at(-4), outcome: "REGRESSED" }],
        }),
      ],
      healthSnapshots: [-1, -2, -3, -4, -5, -6].map((offset) => ({ day: date(offset), status: "RED" as const })),
    }),
  ];
  const actions = busy.flatMap((p) => score(p).actions);

  it("cover every action type and escalation rule", () => {
    expect(new Set(actions.map((a) => a.type))).toEqual(
      new Set(["ESCALATION", "SILENCE", "ISSUE_FOLLOWUP", "FEEDBACK_DUE", "NEW_PLACEMENT", "CHECKIN_DUE"]),
    );
    expect(new Set(actions.map((a) => a.escalation?.rule).filter(Boolean))).toEqual(
      new Set(Object.keys(ESCALATION_ROUTES)),
    );
  });

  it("name who the call is to", () => {
    for (const action of actions) expect(action.reason).toContain(action.callee);
  });

  it("use no pronouns", () => {
    const pronouns = /\b(he|him|his|she|her|hers|they|them|their|theirs|it|its)\b/i;
    for (const action of actions) expect(action.reason).not.toMatch(pronouns);
  });
});

describe("purity", () => {
  it("gives the same result for the same input", () => {
    const p = placement({ feedbackEntries: [clientFeedback(-45, 1)] });
    expect(score(p)).toEqual(score(p));
  });

  it("never reads the clock", () => {
    const source = readFileSync(new URL("./scoring.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/new Date\(|Date\.now\(/);
  });

  it("returns no actions for a placement that has ended, but still judges health", () => {
    const result = score(placement({ status: "ENDED", feedbackEntries: [clientFeedback(-60)] }));
    expect(result.actions).toEqual([]);
    expect(result.health).toBe("RED");
  });

  it("accepts what the repositories return", () => {
    expectTypeOf<HydratedPlacement>().toExtend<ScoringPlacement>();
    expectTypeOf<EscalationContact>().toExtend<ScoringContact>();
  });
});
