"use client";

// Client component: a logged row shows that it is saving, then what
// happened, then folds away; only then are the touched placement's new rows
// swapped in, without re-rendering the page.

import { useEffect, useMemo, useReducer, useRef } from "react";

import type { RowActionResult } from "@/app/actions";
import { CollapsedTodayGroup, TodayGroup } from "@/components/today-group";
import {
  COLLAPSE_MS,
  CONFIRMATION_HOLD_MS,
  initialTodayState,
  isLeaving,
  todayReducer,
} from "@/lib/row-phases";
import { todayGroups, type RowView, type TodayView } from "@/lib/today-view";

const LOST_CONNECTION = "Couldn't save that. Check the connection and try again.";

export type RunRowAction = (
  row: RowView,
  pendingNote: string,
  save: () => Promise<RowActionResult>,
) => Promise<RowActionResult>;

function ClearState({ nextUp }: { nextUp: string }) {
  return (
    <section aria-labelledby="clear-heading" className="relative mt-6 mb-6 py-1 pl-4">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-steady" />
      <h2 id="clear-heading" className="text-name text-chalk">
        {"You're clear today."}
      </h2>
      <p className="mt-1 text-reason text-mute">{nextUp}</p>
    </section>
  );
}

export function TodayList({ initialView }: { initialView: TodayView }) {
  const [state, dispatch] = useReducer(todayReducer, initialView, initialTodayState);
  const groups = useMemo(() => todayGroups(state.view), [state.view]);

  const timers = useRef(new Set<number>());
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  function later(ms: number, then: () => void) {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      then();
    }, ms);
    timers.current.add(id);
  }

  const run: RunRowAction = async (row, pendingNote, save) => {
    dispatch({ type: "pending", key: row.key, placementId: row.placementId, note: pendingNote });

    let result: RowActionResult;
    try {
      result = await save();
    } catch {
      result = { ok: false, message: LOST_CONNECTION };
    }
    if (!result.ok) {
      dispatch({ type: "failed", key: row.key });
      return result;
    }

    dispatch({ type: "confirmed", key: row.key, note: result.confirmation, rows: result.rows, readAt: result.readAt });
    later(CONFIRMATION_HOLD_MS, () => {
      // Reduced motion: no collapse, the row goes straight away.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        dispatch({ type: "gone", key: row.key });
        return;
      }
      dispatch({ type: "collapsing", key: row.key });
      later(COLLAPSE_MS, () => dispatch({ type: "gone", key: row.key }));
    });
    return result;
  };

  const shared = { phases: state.phases, onRun: run };
  const dueToday = [...groups.escalateNow, ...groups.callToday].filter((r) => !isLeaving(state.phases[r.key]));

  return (
    <>
      {dueToday.length === 0 && <ClearState nextUp={groups.nextUp} />}
      {groups.escalateNow.length > 0 && (
        <TodayGroup id="escalate-now" label="Escalate now" rows={groups.escalateNow} {...shared} />
      )}
      {groups.callToday.length > 0 && (
        <TodayGroup id="call-today" label="Call today" rows={groups.callToday} {...shared} />
      )}
      {groups.laterThisWeek.length > 0 && (
        <CollapsedTodayGroup id="later-this-week" label="Later this week" rows={groups.laterThisWeek} {...shared} />
      )}
    </>
  );
}
