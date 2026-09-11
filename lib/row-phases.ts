import { withPlacementRows, type PlacementRows, type TodayView } from "@/lib/today-view";

/*
 * What a row on the Today list is doing after someone acts on it. Pure, so
 * the sequencing — including two rows in flight at once — is tested without
 * a browser.
 *
 *   pending     the write is in flight; the row stays put and says so
 *   confirmed   the write landed; the row shows what happened
 *   collapsing  the confirmation has held; the row is folding away
 *   gone        folded away, waiting for the placement's new rows
 *
 * The server's new rows for a placement are held until none of that
 * placement's rows is still pending, confirming or collapsing. Swapping them
 * in earlier would pull a row out from under its own confirmation.
 */

/** How long a confirmation stays before the row collapses. */
export const CONFIRMATION_HOLD_MS = 900;

/** Matches duration-180 on the row. */
export const COLLAPSE_MS = 180;

export type RowPhase =
  | { placementId: string; stage: "pending"; note: string }
  | { placementId: string; stage: "confirmed" | "collapsing" | "gone"; note: string };

type QueuedRows = { rows: PlacementRows; readAt: number };

export type TodayState = {
  view: TodayView;
  phases: Readonly<Record<string, RowPhase>>;
  queued: Readonly<Record<string, QueuedRows>>;
};

export type RowEvent =
  | { type: "pending"; key: string; placementId: string; note: string }
  | { type: "failed"; key: string }
  | { type: "confirmed"; key: string; note: string; rows: PlacementRows; readAt: number }
  | { type: "collapsing"; key: string }
  | { type: "gone"; key: string };

export function initialTodayState(view: TodayView): TodayState {
  return { view, phases: {}, queued: {} };
}

/** Collapsing or collapsed: no longer counted in its group. */
export function isLeaving(phase: RowPhase | undefined): boolean {
  return phase?.stage === "collapsing" || phase?.stage === "gone";
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/** Swaps in a placement's held rows once nothing on that placement is still moving. */
function settle(state: TodayState, placementId: string): TodayState {
  const queued = state.queued[placementId];
  const moving = Object.values(state.phases).some(
    (phase) => phase.placementId === placementId && phase.stage !== "gone",
  );
  if (!queued || moving) return state;

  return {
    view: withPlacementRows(state.view, queued.rows),
    phases: Object.fromEntries(
      Object.entries(state.phases).filter(([, phase]) => phase.placementId !== placementId),
    ),
    queued: withoutKey(state.queued, placementId),
  };
}

export function todayReducer(state: TodayState, event: RowEvent): TodayState {
  const current = state.phases[event.key];

  switch (event.type) {
    case "pending":
      return {
        ...state,
        phases: {
          ...state.phases,
          [event.key]: { placementId: event.placementId, stage: "pending", note: event.note },
        },
      };

    case "failed": {
      if (!current) return state;
      return settle({ ...state, phases: withoutKey(state.phases, event.key) }, current.placementId);
    }

    case "confirmed": {
      if (!current) return state;
      const { placementId } = current;
      const held = state.queued[placementId];
      // Responses can land out of order; the most recent read wins.
      const queued = !held || event.readAt >= held.readAt ? { rows: event.rows, readAt: event.readAt } : held;
      return {
        ...state,
        phases: { ...state.phases, [event.key]: { placementId, stage: "confirmed", note: event.note } },
        queued: { ...state.queued, [placementId]: queued },
      };
    }

    case "collapsing":
    case "gone": {
      if (!current || current.stage === "pending") return state;
      const next = { ...state, phases: { ...state.phases, [event.key]: { ...current, stage: event.type } } };
      return event.type === "gone" ? settle(next, current.placementId) : next;
    }
  }
}
