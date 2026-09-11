import type { EscalationRule } from "@callsheet/db/types";

import {
  actionOrder,
  roleLabel,
  UPCOMING_HORIZON_DAYS,
  type EscalationDetail,
  type PlacementScore,
  type ScoredAction,
  type ScoringPlacement,
  type UpcomingItem,
} from "@/lib/scoring";
import type { TodayResult } from "@/lib/today-query";

/**
 * Turns scored placements into the rows the Today screen renders. Pure, so
 * the grouping and wording are tested without a browser.
 *
 * Rows are kept per placement. A row action re-scores only the placement it
 * touched and swaps that placement's rows in; the groups are then assembled
 * the same way as on a full load, so the list comes out identical.
 */

/** "Later this week" covers the next six days, so a weekday name always means one date. */
export const LATER_WINDOW_DAYS = 6;

export const NOTHING_COMING_UP = `Nothing else falls due in the next ${UPCOMING_HORIZON_DAYS} days.`;

export type Severity = "alert" | "watch" | "routine";

export type RowActionView =
  | { kind: "feedback"; placementId: string; contactName: string }
  | { kind: "followUp"; followUpId: string }
  | { kind: "checkIn"; checkInId: string }
  | { kind: "escalate"; placementId: string; rule: EscalationRule; issueId: string | null };

/** Lower sorts first. Actions: [-score, type order]. Coming up: [days away, type order]. */
export type RowOrder = readonly [number, number];

export type RowView = {
  key: string;
  placementId: string;
  order: RowOrder;
  professional: string;
  context: string;
  reason: string;
  severity: Severity;
  /** Escalation rows only: the rule that tripped and who it goes to. */
  escalationLine: string | null;
  action: RowActionView;
};

export type PlacementRows = {
  placementId: string;
  escalateNow: RowView[];
  callToday: RowView[];
  laterThisWeek: RowView[];
  /** This placement's soonest upcoming item, as a next-up line. */
  nextUp: { order: RowOrder; line: string } | null;
};

export type TodayView = {
  /** Placement ids in load order, which breaks ties between equal rows. */
  placementIds: string[];
  rowsByPlacement: Record<string, PlacementRows>;
};

export type TodayGroups = {
  escalateNow: RowView[];
  callToday: RowView[];
  laterThisWeek: RowView[];
  /** The line under "You're clear today". */
  nextUp: string;
};

const NBSP = String.fromCharCode(160);

/** Client, then where the placement sits in its life. */
export function contextLine(clientName: string, score: Pick<PlacementScore, "dayIndex" | "inTrial">): string {
  if (!score.inTrial) return `${clientName}, ${Math.floor(score.dayIndex / 30)} months in`;
  if (score.dayIndex === 0) return `${clientName}, first day of trial`;
  return `${clientName}, day ${score.dayIndex} of trial`;
}

function escalationLine(escalation: EscalationDetail): string {
  // Non-breaking spaces keep the dash on the rule's line and "needs" with the
  // whole name when this wraps at 360px.
  return escalation.contact
    ? `${escalation.ruleLabel}${NBSP}— needs${NBSP}${escalation.contact.name.replaceAll(" ", NBSP)}.`
    : `${escalation.ruleLabel}${NBSP}— nobody holds the ${roleLabel(escalation.role)} role yet.`;
}

type Item = Pick<
  ScoredAction,
  "type" | "placementId" | "reason" | "callee" | "issueId" | "followUpId" | "checkInId"
> & {
  escalation?: EscalationDetail | null;
};

function required(value: string | null, what: string): string {
  if (value === null) throw new Error(`A Today row is missing its ${what}.`);
  return value;
}

function actionFor(item: Item): RowActionView {
  switch (item.type) {
    case "ESCALATION":
      if (!item.escalation) throw new Error("An escalation row is missing its rule.");
      return {
        kind: "escalate",
        placementId: item.placementId,
        rule: item.escalation.rule,
        issueId: item.issueId,
      };
    case "SILENCE":
    case "FEEDBACK_DUE":
    case "NEW_PLACEMENT":
      return { kind: "feedback", placementId: item.placementId, contactName: item.callee };
    case "ISSUE_FOLLOWUP":
      return { kind: "followUp", followUpId: required(item.followUpId, "follow-up") };
    case "CHECKIN_DUE":
      return { kind: "checkIn", checkInId: required(item.checkInId, "check-in") };
  }
}

function keyFor(item: Item): string {
  return [
    item.type,
    item.placementId,
    item.issueId ?? "",
    item.followUpId ?? "",
    item.checkInId ?? "",
    item.escalation?.rule ?? "",
  ].join(":");
}

/** One placement's rows, from its score. */
export function placementRows(placement: ScoringPlacement, score: PlacementScore): PlacementRows {
  const row = (item: Item, order: RowOrder, severity: Severity): RowView => ({
    key: keyFor(item),
    placementId: placement.id,
    order,
    professional: placement.professional.name,
    context: contextLine(placement.client.name, score),
    reason: item.reason,
    severity,
    escalationLine: item.escalation ? escalationLine(item.escalation) : null,
    action: actionFor(item),
  });
  const healthy = score.health === "GREEN";
  const soonest: UpcomingItem | undefined = score.upcoming[0];

  return {
    placementId: placement.id,
    escalateNow: score.actions
      .filter((action) => action.type === "ESCALATION")
      .map((action) => row(action, [-action.score, actionOrder(action.type)], "alert")),
    // A check-in due today is a routine call whatever the placement's health.
    callToday: score.actions
      .filter((action) => action.type !== "ESCALATION")
      .map((action) => {
        const dueTodayCheckIn = action.type === "CHECKIN_DUE" && action.daysOverdue === 0;
        return row(action, [-action.score, actionOrder(action.type)], dueTodayCheckIn || healthy ? "routine" : "watch");
      }),
    laterThisWeek: score.upcoming
      .filter((item) => item.daysAway <= LATER_WINDOW_DAYS)
      .map((item) => row(item, [item.daysAway, actionOrder(item.type)], "routine")),
    nextUp: soonest
      ? {
          order: [soonest.daysAway, actionOrder(soonest.type)],
          line: `Next up: ${placement.professional.name} at ${placement.client.name}, ${soonest.what} due ${soonest.when}.`,
        }
      : null,
  };
}

/** Rows for a placement that no longer shows anything: gone, or no longer active. */
export function emptyPlacementRows(placementId: string): PlacementRows {
  return { placementId, escalateNow: [], callToday: [], laterThisWeek: [], nextUp: null };
}

export function buildTodayView<P extends ScoringPlacement>(result: TodayResult<P>): TodayView {
  return {
    placementIds: result.placements.map(({ placement }) => placement.id),
    rowsByPlacement: Object.fromEntries(
      result.placements.map(({ placement, score }) => [placement.id, placementRows(placement, score)]),
    ),
  };
}

/** The view with one placement's rows replaced. */
export function withPlacementRows(view: TodayView, rows: PlacementRows): TodayView {
  return {
    placementIds: view.placementIds.includes(rows.placementId)
      ? view.placementIds
      : [...view.placementIds, rows.placementId],
    rowsByPlacement: { ...view.rowsByPlacement, [rows.placementId]: rows },
  };
}

function byOrder(a: { order: RowOrder }, b: { order: RowOrder }): number {
  return a.order[0] - b.order[0] || a.order[1] - b.order[1];
}

/**
 * The three groups and the next-up line. Rows are gathered in placement order
 * and sorted stably, so equal rows keep that order on a full load and after a
 * swap alike.
 */
export function todayGroups(view: TodayView): TodayGroups {
  const all = view.placementIds.flatMap((id) => {
    const rows = view.rowsByPlacement[id];
    return rows ? [rows] : [];
  });
  const next = all.flatMap((rows) => (rows.nextUp ? [rows.nextUp] : [])).sort(byOrder)[0];

  return {
    escalateNow: all.flatMap((rows) => rows.escalateNow).sort(byOrder),
    callToday: all.flatMap((rows) => rows.callToday).sort(byOrder),
    laterThisWeek: all.flatMap((rows) => rows.laterThisWeek).sort(byOrder),
    nextUp: next ? next.line : NOTHING_COMING_UP,
  };
}
