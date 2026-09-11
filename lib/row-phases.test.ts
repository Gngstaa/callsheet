import { describe, expect, it } from "vitest";

import { initialTodayState, isLeaving, todayReducer, type RowEvent, type TodayState } from "@/lib/row-phases";
import { todayGroups, type PlacementRows, type RowView, type TodayView } from "@/lib/today-view";

// Invented names. Rows are minimal: the reducer only cares about keys and placements.

function row(key: string, placementId: string, score: number): RowView {
  return {
    key,
    placementId,
    order: [-score, 5],
    professional: `Professional ${placementId}`,
    context: "Lakeshore Architecture Studio, 8 months in",
    reason: "Monthly check-in with Dana Whitfield is 2 days overdue.",
    severity: "routine",
    escalationLine: null,
    action: { kind: "checkIn", checkInId: `${key}-check-in` },
  };
}

function rowsFor(placementId: string, callToday: RowView[]): PlacementRows {
  return { placementId, escalateNow: [], callToday, laterThisWeek: [], nextUp: null };
}

const view: TodayView = {
  placementIds: ["a", "b"],
  rowsByPlacement: {
    a: rowsFor("a", [row("a1", "a", 30), row("a2", "a", 20)]),
    b: rowsFor("b", [row("b1", "b", 10)]),
  },
};

function play(...events: RowEvent[]): TodayState {
  return events.reduce(todayReducer, initialTodayState(view));
}

const callTodayKeys = (state: TodayState) => todayGroups(state.view).callToday.map((r) => r.key);

describe("row phases", () => {
  it("keeps a pending row in place and counted", () => {
    const state = play({ type: "pending", key: "a1", placementId: "a", note: "Logging check-in…" });
    expect(state.phases.a1).toEqual({ placementId: "a", stage: "pending", note: "Logging check-in…" });
    expect(isLeaving(state.phases.a1)).toBe(false);
    expect(callTodayKeys(state)).toEqual(["a1", "a2", "b1"]);
  });

  it("holds the new rows while the confirmation shows, and still counts the row", () => {
    const state = play(
      { type: "pending", key: "a1", placementId: "a", note: "Logging check-in…" },
      { type: "confirmed", key: "a1", note: "Check-in logged.", rows: rowsFor("a", [row("a2", "a", 20)]), readAt: 1 },
    );
    expect(state.phases.a1.stage).toBe("confirmed");
    expect(isLeaving(state.phases.a1)).toBe(false);
    expect(callTodayKeys(state)).toEqual(["a1", "a2", "b1"]);
  });

  it("stops counting the row when it starts to collapse, and swaps in the new rows once it has gone", () => {
    const confirmed: RowEvent[] = [
      { type: "pending", key: "a1", placementId: "a", note: "Logging check-in…" },
      { type: "confirmed", key: "a1", note: "Check-in logged.", rows: rowsFor("a", [row("a2", "a", 20)]), readAt: 1 },
    ];
    const collapsing = play(...confirmed, { type: "collapsing", key: "a1" });
    expect(isLeaving(collapsing.phases.a1)).toBe(true);
    expect(callTodayKeys(collapsing)).toEqual(["a1", "a2", "b1"]);

    const gone = play(...confirmed, { type: "collapsing", key: "a1" }, { type: "gone", key: "a1" });
    expect(callTodayKeys(gone)).toEqual(["a2", "b1"]);
    expect(gone.phases).toEqual({});
    expect(gone.queued).toEqual({});
  });

  it("returns a failed row to normal and swaps nothing in", () => {
    const state = play(
      { type: "pending", key: "b1", placementId: "b", note: "Logging check-in…" },
      { type: "failed", key: "b1" },
    );
    expect(state.phases).toEqual({});
    expect(callTodayKeys(state)).toEqual(["a1", "a2", "b1"]);
  });

  it("waits for every row of a placement before swapping, then uses the newest read", () => {
    const state = play(
      { type: "pending", key: "a1", placementId: "a", note: "Logging check-in…" },
      { type: "pending", key: "a2", placementId: "a", note: "Logging check-in…" },
      // a2 answers first but read later; a1's older read must not overwrite it.
      { type: "confirmed", key: "a2", note: "Check-in logged.", rows: rowsFor("a", []), readAt: 20 },
      { type: "confirmed", key: "a1", note: "Check-in logged.", rows: rowsFor("a", [row("a2", "a", 20)]), readAt: 10 },
      { type: "collapsing", key: "a2" },
      { type: "gone", key: "a2" },
    );
    // a1 is still confirming, so a2 has gone from view but the rows are held.
    expect(isLeaving(state.phases.a2)).toBe(true);
    expect(callTodayKeys(state)).toEqual(["a1", "a2", "b1"]);

    const done = [
      { type: "collapsing", key: "a1" },
      { type: "gone", key: "a1" },
    ] satisfies RowEvent[];
    const settled = done.reduce(todayReducer, state);
    expect(callTodayKeys(settled)).toEqual(["b1"]);
    expect(settled.phases).toEqual({});
  });

  it("swaps in a finished row's placement when another row of it fails", () => {
    const state = play(
      { type: "pending", key: "a1", placementId: "a", note: "Logging check-in…" },
      { type: "pending", key: "a2", placementId: "a", note: "Logging check-in…" },
      { type: "confirmed", key: "a1", note: "Check-in logged.", rows: rowsFor("a", [row("a2", "a", 20)]), readAt: 1 },
      { type: "collapsing", key: "a1" },
      { type: "gone", key: "a1" },
      { type: "failed", key: "a2" },
    );
    expect(callTodayKeys(state)).toEqual(["a2", "b1"]);
    expect(state.phases).toEqual({});
  });

  it("leaves other placements alone", () => {
    const state = play(
      { type: "pending", key: "b1", placementId: "b", note: "Logging check-in…" },
      { type: "confirmed", key: "b1", note: "Check-in logged.", rows: rowsFor("b", []), readAt: 1 },
      { type: "collapsing", key: "b1" },
      { type: "gone", key: "b1" },
    );
    expect(state.view.rowsByPlacement.a).toBe(view.rowsByPlacement.a);
    expect(callTodayKeys(state)).toEqual(["a1", "a2"]);
  });

  it("ignores events for rows it is not tracking", () => {
    const state = play({ type: "collapsing", key: "a1" }, { type: "gone", key: "a1" }, { type: "failed", key: "b1" });
    expect(state).toEqual(initialTodayState(view));
  });
});
