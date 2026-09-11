import type {
  ActionLog,
  ActionType,
  CheckIn,
  Client,
  Escalation,
  EscalationContact,
  EscalationRole,
  EscalationRule,
  FeedbackEntry,
  HealthSnapshot,
  HealthStatus,
  Issue,
  IssueFollowUp,
  IssueStatus,
  IssueType,
  Placement,
  Professional,
} from "@callsheet/db/types";

import { ESCALATION_ROUTES } from "@/lib/escalation-routes";

/*
 * The scoring engine. SPEC.md, "The scoring engine", is the source of truth.
 *
 * Pure: takes a hydrated placement, the escalation contacts and an injected
 * reference instant, and returns the placement's score, health and today's
 * actions. No database access and no reading the clock, so a given input
 * always gives the same answer.
 */

// ---------------------------------------------------------------------------
// Inputs

export type ScoringIssue = Pick<
  Issue,
  "id" | "type" | "status" | "reportedAt" | "reportedBy"
> & {
  followUps: readonly Pick<
    IssueFollowUp,
    "id" | "offsetDays" | "dueAt" | "checkedAt" | "outcome"
  >[];
};

/** The fields scoring reads. A HydratedPlacement from the repository fits. */
export type ScoringPlacement = Pick<Placement, "id" | "status" | "startDate"> & {
  client: Pick<Client, "name" | "contactName">;
  professional: Pick<Professional, "name">;
  feedbackEntries: readonly Pick<
    FeedbackEntry,
    "party" | "collectedAt" | "sentiment"
  >[];
  issues: readonly ScoringIssue[];
  checkIns: readonly Pick<CheckIn, "id" | "party" | "dueOn" | "completedAt">[];
  actionLogs: readonly Pick<ActionLog, "actionType" | "performedAt">[];
  escalations: readonly Pick<Escalation, "rule" | "issueId" | "escalatedAt">[];
  healthSnapshots: readonly Pick<HealthSnapshot, "day" | "status">[];
};

export type ScoringContact = Pick<EscalationContact, "id" | "name" | "role">;

export type ScoringContext = {
  /** The instant "today" is derived from, in America/New_York. */
  referenceDate: Date;
  contacts: readonly ScoringContact[];
};

// ---------------------------------------------------------------------------
// Outputs

export type ScoreComponent = {
  label: string;
  points: number;
};

export type EscalationDetail = {
  rule: EscalationRule;
  /** Names the rule on the row, e.g. "Second attendance issue in 30 days". */
  ruleLabel: string;
  role: EscalationRole;
  /** Null when nobody holds the role yet. */
  contact: ScoringContact | null;
};

export type ScoredAction = {
  type: ActionType;
  placementId: string;
  score: number;
  /** A sentence naming who the call is to. */
  reason: string;
  /** Who the call is to, exactly as named in the reason. */
  callee: string;
  issueId: string | null;
  followUpId: string | null;
  checkInId: string | null;
  escalation: EscalationDetail | null;
};

export type PlacementScore = {
  placementId: string;
  dayIndex: number;
  inTrial: boolean;
  feedbackCadenceDays: number;
  daysSinceClientFeedback: number;
  silenceRatio: number;
  /** Clamped to 100. */
  score: number;
  /** Every point behind the score, itemised, before the clamp. */
  components: ScoreComponent[];
  health: HealthStatus;
  /** Highest score first. Empty unless the placement is active. */
  actions: ScoredAction[];
};

// ---------------------------------------------------------------------------
// Time. "Today" is the US Eastern business day. SPEC.md, "Time".

const DAY_MS = 86_400_000;

export const OPERATIONAL_TIME_ZONE = "America/New_York";

const easternDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: OPERATIONAL_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** Day number (days since 1970-01-01) of the Eastern day containing an instant. */
export function operationalDay(instant: Date): number {
  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of easternDateParts.formatToParts(instant)) {
    if (part.type === "year") year = Number(part.value);
    else if (part.type === "month") month = Number(part.value);
    else if (part.type === "day") day = Number(part.value);
  }
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** Day number of a `date` column. Prisma returns those as UTC midnight. */
function calendarDay(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

// ---------------------------------------------------------------------------
// Weights. SPEC.md, "Points".

const TRIAL_LAST_DAY = 90;
const NEW_PLACEMENT_LAST_DAY = 14;
const OPEN_ISSUE_POINTS = 25;
const OPEN_ISSUE_POINTS_CAP = 50;
const ESCALATION_POINTS = 60;
const LOW_SENTIMENT = 2;
const LOW_SENTIMENT_POINTS = 25;
const REPEAT_ATTENDANCE_WINDOW_DAYS = 30;
const RED_STREAK_DAYS = 7;
const MAX_SCORE = 100;

export function feedbackCadenceDays(dayIndex: number): number {
  if (dayIndex <= 30) return 7;
  if (dayIndex <= 90) return 14;
  return 30;
}

// Day 0, the start date itself, takes the day 1-14 weight.
function trialPoints(dayIndex: number): number {
  if (dayIndex <= 14) return 30;
  if (dayIndex <= 45) return 20;
  if (dayIndex <= TRIAL_LAST_DAY) return 10;
  return 0;
}

function silencePoints(ratio: number): number {
  if (ratio >= 2) return 50;
  if (ratio >= 1.5) return 40;
  if (ratio >= 1) return 20;
  return 0;
}

function followUpPoints(daysOverdue: number): number {
  return daysOverdue > 3 ? 35 : 20;
}

function checkInPoints(daysOverdue: number): number {
  return daysOverdue >= 7 ? 20 : 10;
}

function clampScore(points: number): number {
  return Math.min(points, MAX_SCORE);
}

// Tie-break within equal scores, in SPEC.md's table order.
const ACTION_ORDER: readonly ActionType[] = [
  "ESCALATION",
  "SILENCE",
  "ISSUE_FOLLOWUP",
  "FEEDBACK_DUE",
  "NEW_PLACEMENT",
  "CHECKIN_DUE",
];

/** Highest score first; equal scores in SPEC.md's table order, escalation first. */
export function compareActions(
  a: Pick<ScoredAction, "score" | "type">,
  b: Pick<ScoredAction, "score" | "type">,
): number {
  return b.score - a.score || ACTION_ORDER.indexOf(a.type) - ACTION_ORDER.indexOf(b.type);
}

// ---------------------------------------------------------------------------
// Words. Every sentence names who the call is to and uses no pronouns.

const RULE_LABELS: Readonly<Record<EscalationRule, string>> = {
  TWO_OPEN_ISSUES: "Two or more open issues",
  TRIAL_CLIENT_COMPLAINT: "Client complaint during the trial",
  REPEAT_ATTENDANCE: "Second attendance issue in 30 days",
  RED_SEVEN_DAYS: "Red for seven days running",
  REPLACEMENT_REQUEST: "Client asked for a replacement",
  REGRESSED_FOLLOW_UP: "Fix did not hold at a follow-up check",
};

const ROLE_LABELS: Readonly<Record<EscalationRole, string>> = {
  ACCOUNT_DIRECTOR: "account director",
  DELIVERY_MANAGER: "delivery manager",
};

const ISSUE_PHRASES: Readonly<Record<IssueType, string>> = {
  CLIENT_COMPLAINT: "the client complaint",
  UNDERPERFORMANCE: "the performance issue",
  ATTENDANCE: "the attendance issue",
  REPLACEMENT_REQUEST: "the replacement request",
};

function days(count: number): string {
  return count === 1 ? "1 day" : `${count} days`;
}

function cadencePhrase(cadenceDays: number): string {
  if (cadenceDays === 7) return "every week";
  if (cadenceDays === 14) return "every two weeks";
  if (cadenceDays === 30) return "every month";
  return `every ${days(cadenceDays)}`;
}

// ---------------------------------------------------------------------------
// Issues

type Regression = { offsetDays: number; checkedAt: Date };

function latestRegression(issue: ScoringIssue): Regression | undefined {
  let latest: Regression | undefined;
  for (const followUp of issue.followUps) {
    if (followUp.outcome !== "REGRESSED" || !followUp.checkedAt) continue;
    if (!latest || followUp.checkedAt > latest.checkedAt) {
      latest = { offsetDays: followUp.offsetDays, checkedAt: followUp.checkedAt };
    }
  }
  return latest;
}

/**
 * A regressed follow-up reopens its issue. The repository flips the status
 * column in the same transaction, but scoring does not rely on that having
 * happened.
 */
function effectiveStatus(issue: ScoringIssue): IssueStatus {
  if (issue.status === "FIXED" && latestRegression(issue)) return "REGRESSED";
  return issue.status;
}

function isOpen(status: IssueStatus): boolean {
  return status === "OPEN" || status === "REGRESSED";
}

/** The day an issue became open: reported, or most recently regressed. */
function openedDay(issue: ScoringIssue, status: IssueStatus): number {
  const regression = status === "REGRESSED" ? latestRegression(issue) : undefined;
  return operationalDay(regression?.checkedAt ?? issue.reportedAt);
}

// ---------------------------------------------------------------------------
// The engine

type Candidate = Omit<ScoredAction, "placementId" | "score"> & {
  ownPoints: number;
};

type CandidateRefs = Partial<
  Pick<ScoredAction, "issueId" | "followUpId" | "checkInId" | "escalation">
>;

function candidate(
  type: ActionType,
  reason: string,
  callee: string,
  ownPoints: number,
  refs: CandidateRefs = {},
): Candidate {
  return {
    type,
    reason,
    callee,
    ownPoints,
    issueId: refs.issueId ?? null,
    followUpId: refs.followUpId ?? null,
    checkInId: refs.checkInId ?? null,
    escalation: refs.escalation ?? null,
  };
}

/** A rule that has tripped, escalated or not. */
type Trip = {
  rule: EscalationRule;
  /** Null for placement-wide rules. */
  issueId: string | null;
  /** The Eastern day the rule tripped; an escalation on or after it counts. */
  trippedDay: number;
  /** Finishes "… needs to hear that". */
  clause: string;
};

export function scorePlacement(
  placement: ScoringPlacement,
  context: ScoringContext,
): PlacementScore {
  const today = operationalDay(context.referenceDate);
  const startDay = calendarDay(placement.startDate);
  const dayIndex = today - startDay;
  const cadence = feedbackCadenceDays(dayIndex);

  if (dayIndex < 0) {
    return {
      placementId: placement.id,
      dayIndex,
      inTrial: false,
      feedbackCadenceDays: cadence,
      daysSinceClientFeedback: 0,
      silenceRatio: 0,
      score: 0,
      components: [],
      health: "GREEN",
      actions: [],
    };
  }

  const clientName = placement.client.name;
  const contactName = placement.client.contactName;
  const professionalName = placement.professional.name;

  // Only what had happened by the reference day counts, so replaying a past
  // date gives the answer that date would have given.
  let lastClientFeedback: ScoringPlacement["feedbackEntries"][number] | undefined;
  for (const entry of placement.feedbackEntries) {
    if (entry.party !== "CLIENT" || operationalDay(entry.collectedAt) > today) continue;
    if (!lastClientFeedback || entry.collectedAt > lastClientFeedback.collectedAt) {
      lastClientFeedback = entry;
    }
  }

  const daysSinceClientFeedback = lastClientFeedback
    ? today - operationalDay(lastClientFeedback.collectedAt)
    : dayIndex;
  const silenceRatio = daysSinceClientFeedback / cadence;

  const issues = placement.issues
    .filter((issue) => operationalDay(issue.reportedAt) <= today)
    .map((issue) => ({ issue, status: effectiveStatus(issue) }));
  const openIssues = issues.filter(({ status }) => isOpen(status));

  const candidates: Candidate[] = [];

  // Client feedback produces at most one action, and that action carries the
  // silence points: new placement first, then silence, then due today.
  const feedbackPoints = silencePoints(silenceRatio);
  if (!lastClientFeedback && dayIndex >= 1 && dayIndex <= NEW_PLACEMENT_LAST_DAY) {
    candidates.push(
      candidate(
        "NEW_PLACEMENT",
        `No feedback from ${contactName} since the placement started ${days(dayIndex)} ago.`,
        contactName,
        feedbackPoints,
      ),
    );
  } else if (daysSinceClientFeedback > cadence) {
    const reason = lastClientFeedback
      ? `No feedback from ${contactName} in ${days(daysSinceClientFeedback)}, and feedback is due ${cadencePhrase(cadence)}.`
      : `No feedback from ${contactName} since the placement started ${days(dayIndex)} ago.`;
    candidates.push(candidate("SILENCE", reason, contactName, feedbackPoints));
  } else if (daysSinceClientFeedback === cadence) {
    candidates.push(
      candidate(
        "FEEDBACK_DUE",
        `Feedback from ${contactName} is due today.`,
        contactName,
        feedbackPoints,
      ),
    );
  }

  // Follow-up windows on fixed issues. One action per window; the placement
  // score counts only the most overdue.
  let mostOverdueFollowUp = -1;
  for (const { issue, status } of issues) {
    if (status !== "FIXED") continue;
    for (const followUp of issue.followUps) {
      if (followUp.checkedAt) continue;
      const overdue = today - operationalDay(followUp.dueAt);
      if (overdue < 0) continue;
      mostOverdueFollowUp = Math.max(mostOverdueFollowUp, overdue);

      const callee = issue.reportedBy === "PROFESSIONAL" ? professionalName : contactName;
      const when = overdue === 0 ? "is due today" : `was due ${days(overdue)} ago`;
      candidates.push(
        candidate(
          "ISSUE_FOLLOWUP",
          `Check with ${callee} that ${ISSUE_PHRASES[issue.type]} is still resolved. The ${followUp.offsetDays}-day check ${when}.`,
          callee,
          followUpPoints(overdue),
          { issueId: issue.id, followUpId: followUp.id },
        ),
      );
    }
  }

  // Monthly check-ins, once past the due day. Same rule: one action each, the
  // most overdue counts toward the placement.
  let mostOverdueCheckIn = 0;
  for (const checkIn of placement.checkIns) {
    if (checkIn.completedAt) continue;
    const overdue = today - calendarDay(checkIn.dueOn);
    if (overdue < 1) continue;
    mostOverdueCheckIn = Math.max(mostOverdueCheckIn, overdue);

    const callee = checkIn.party === "CLIENT" ? contactName : professionalName;
    candidates.push(
      candidate(
        "CHECKIN_DUE",
        `Monthly check-in with ${callee} is ${days(overdue)} overdue.`,
        callee,
        checkInPoints(overdue),
        { checkInId: checkIn.id },
      ),
    );
  }

  // Escalation rules. SPEC.md, "Escalation rules".
  const trips: Trip[] = [];

  // 1. Two or more open issues. A newly opened issue trips it again.
  if (openIssues.length >= 2) {
    trips.push({
      rule: "TWO_OPEN_ISSUES",
      issueId: null,
      trippedDay: Math.max(...openIssues.map(({ issue, status }) => openedDay(issue, status))),
      clause: `${professionalName} has ${openIssues.length} open issues at ${clientName}`,
    });
  }

  // 2. A client complaint raised during the trial, until it is closed.
  for (const { issue, status } of issues) {
    if (issue.type !== "CLIENT_COMPLAINT" || status === "CLOSED") continue;
    const reportedDay = operationalDay(issue.reportedAt);
    const dayOfTrial = reportedDay - startDay;
    if (dayOfTrial < 0 || dayOfTrial > TRIAL_LAST_DAY) continue;
    trips.push({
      rule: "TRIAL_CLIENT_COMPLAINT",
      issueId: issue.id,
      trippedDay: reportedDay,
      clause: `${clientName} raised a complaint on day ${dayOfTrial} of the trial`,
    });
  }

  // 3. An attendance issue within 30 days of the one before, until closed.
  const attendance = issues
    .filter(({ issue }) => issue.type === "ATTENDANCE")
    .sort((a, b) => a.issue.reportedAt.getTime() - b.issue.reportedAt.getTime());
  for (let i = 1; i < attendance.length; i++) {
    const current = attendance[i];
    if (current.status === "CLOSED") continue;
    const currentDay = operationalDay(current.issue.reportedAt);
    const gap = currentDay - operationalDay(attendance[i - 1].issue.reportedAt);
    if (gap > REPEAT_ATTENDANCE_WINDOW_DAYS) continue;
    const when = gap === 0 ? "on the same day as the one before" : `${days(gap)} after the one before`;
    trips.push({
      rule: "REPEAT_ATTENDANCE",
      issueId: current.issue.id,
      trippedDay: currentDay,
      clause: `${professionalName} had a second attendance issue ${when}`,
    });
  }

  // 5. A replacement request, until closed.
  for (const { issue, status } of issues) {
    if (issue.type !== "REPLACEMENT_REQUEST" || status === "CLOSED") continue;
    trips.push({
      rule: "REPLACEMENT_REQUEST",
      issueId: issue.id,
      trippedDay: operationalDay(issue.reportedAt),
      clause: `${clientName} asked to replace ${professionalName}`,
    });
  }

  // 6. A follow-up came back REGRESSED. A later regression trips it again.
  for (const { issue, status } of issues) {
    if (status !== "REGRESSED") continue;
    const regression = latestRegression(issue);
    if (!regression) continue;
    trips.push({
      rule: "REGRESSED_FOLLOW_UP",
      issueId: issue.id,
      trippedDay: operationalDay(regression.checkedAt),
      clause: `${ISSUE_PHRASES[issue.type]} for ${professionalName} came back at the ${regression.offsetDays}-day check`,
    });
  }

  const isEscalated = (trip: Trip) =>
    placement.escalations.some(
      (escalation) =>
        escalation.rule === trip.rule &&
        escalation.issueId === trip.issueId &&
        operationalDay(escalation.escalatedAt) >= trip.trippedDay,
    );

  // Points that do not depend on whether an escalation is pending.
  const trial = trialPoints(dayIndex);
  const openIssuePoints = Math.min(openIssues.length * OPEN_ISSUE_POINTS, OPEN_ISSUE_POINTS_CAP);
  const sentimentPoints =
    lastClientFeedback && lastClientFeedback.sentiment <= LOW_SENTIMENT ? LOW_SENTIMENT_POINTS : 0;
  const worstFollowUpPoints = mostOverdueFollowUp >= 0 ? followUpPoints(mostOverdueFollowUp) : 0;
  const worstCheckInPoints = mostOverdueCheckIn > 0 ? checkInPoints(mostOverdueCheckIn) : 0;
  const basePoints =
    trial +
    feedbackPoints +
    openIssuePoints +
    worstFollowUpPoints +
    sentimentPoints +
    worstCheckInPoints;

  const healthFor = (escalationPending: boolean): HealthStatus => {
    const score = clampScore(basePoints + (escalationPending ? ESCALATION_POINTS : 0));
    if (score >= 70 || escalationPending || silenceRatio >= 2) return "RED";
    if (score >= 35) return "AMBER";
    return "GREEN";
  };

  // 4. Red for seven Eastern days running: today, judged without this rule so
  // it cannot keep itself red, plus the six snapshots before it. A new streak
  // after a break trips it again.
  if (healthFor(trips.some((trip) => !isEscalated(trip))) === "RED") {
    const redDays = new Set(
      placement.healthSnapshots
        .filter((snapshot) => snapshot.status === "RED")
        .map((snapshot) => calendarDay(snapshot.day)),
    );
    let streakStart = today;
    while (redDays.has(streakStart - 1)) streakStart--;
    const streak = today - streakStart + 1;
    if (streak >= RED_STREAK_DAYS) {
      trips.push({
        rule: "RED_SEVEN_DAYS",
        issueId: null,
        trippedDay: streakStart,
        clause: `${professionalName}'s placement at ${clientName} has been red for ${days(streak)}`,
      });
    }
  }

  const pending = trips.filter((trip) => !isEscalated(trip));
  const escalationPending = pending.length > 0;

  for (const trip of pending) {
    const role = ESCALATION_ROUTES[trip.rule];
    const contact = context.contacts.find((c) => c.role === role) ?? null;
    const roleLabel = ROLE_LABELS[role];
    const reason = contact
      ? `${contact.name}, the ${roleLabel}, needs to hear that ${trip.clause}.`
      : `The ${roleLabel} needs to hear that ${trip.clause}.`;
    candidates.push(
      candidate("ESCALATION", reason, contact ? contact.name : `the ${roleLabel}`, ESCALATION_POINTS, {
        issueId: trip.issueId,
        escalation: { rule: trip.rule, ruleLabel: RULE_LABELS[trip.rule], role, contact },
      }),
    );
  }

  const components: ScoreComponent[] = [];
  if (trial > 0) {
    components.push({ label: `Day ${dayIndex} of the trial`, points: trial });
  }
  if (feedbackPoints > 0) {
    components.push({
      label: lastClientFeedback
        ? `No client feedback in ${days(daysSinceClientFeedback)}, with feedback due ${cadencePhrase(cadence)}`
        : `No client feedback since the start, ${days(dayIndex)} ago`,
      points: feedbackPoints,
    });
  }
  if (openIssuePoints > 0) {
    components.push({
      label: openIssues.length === 1 ? "1 open issue" : `${openIssues.length} open issues`,
      points: openIssuePoints,
    });
  }
  if (worstFollowUpPoints > 0) {
    components.push({
      label:
        mostOverdueFollowUp === 0
          ? "Follow-up check due today"
          : `Follow-up check ${days(mostOverdueFollowUp)} overdue`,
      points: worstFollowUpPoints,
    });
  }
  if (escalationPending) {
    components.push({ label: "Escalation pending", points: ESCALATION_POINTS });
  }
  if (lastClientFeedback && sentimentPoints > 0) {
    components.push({
      label: `Last client rating was ${lastClientFeedback.sentiment} out of 5`,
      points: sentimentPoints,
    });
  }
  if (worstCheckInPoints > 0) {
    components.push({
      label: `Check-in ${days(mostOverdueCheckIn)} overdue`,
      points: worstCheckInPoints,
    });
  }

  // Trial weight, open issues and a low rating apply to every action on the
  // placement; each action adds only its own points on top.
  const contextPoints = trial + openIssuePoints + sentimentPoints;
  const loggedToday = new Set(
    placement.actionLogs
      .filter((log) => operationalDay(log.performedAt) === today)
      .map((log) => log.actionType),
  );

  const actions: ScoredAction[] =
    placement.status === "ACTIVE"
      ? candidates
          .filter((c) => !loggedToday.has(c.type))
          .map(({ ownPoints, ...rest }) => ({
            ...rest,
            placementId: placement.id,
            score: clampScore(contextPoints + ownPoints),
          }))
          .sort(compareActions)
      : [];

  return {
    placementId: placement.id,
    dayIndex,
    inTrial: dayIndex <= TRIAL_LAST_DAY,
    feedbackCadenceDays: cadence,
    daysSinceClientFeedback,
    silenceRatio,
    score: clampScore(basePoints + (escalationPending ? ESCALATION_POINTS : 0)),
    components,
    health: healthFor(escalationPending),
    actions,
  };
}
