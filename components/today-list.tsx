"use client";

// Client component so a logged row leaves the list, and its group count
// drops, the moment the action starts; when the server answers, the touched
// placement's rows are swapped in without re-rendering the page.

import { useMemo, useOptimistic, useState } from "react";

import { CollapsedTodayGroup, TodayGroup } from "@/components/today-group";
import { todayGroups, withPlacementRows, type PlacementRows, type TodayView } from "@/lib/today-view";

const NOTHING_LEAVING: ReadonlySet<string> = new Set();

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
  const [view, setView] = useState(initialView);
  const [leaving, markLeaving] = useOptimistic<ReadonlySet<string>, string>(
    NOTHING_LEAVING,
    (current, rowKey) => new Set([...current, rowKey]),
  );
  const groups = useMemo(() => todayGroups(view), [view]);

  const applyRows = (rows: PlacementRows) => setView((current) => withPlacementRows(current, rows));
  const handlers = { leaving, onLeave: markLeaving, onSaved: applyRows };

  const dueToday = [...groups.escalateNow, ...groups.callToday].filter((row) => !leaving.has(row.key));

  return (
    <>
      {dueToday.length === 0 && <ClearState nextUp={groups.nextUp} />}
      {groups.escalateNow.length > 0 && (
        <TodayGroup id="escalate-now" label="Escalate now" rows={groups.escalateNow} {...handlers} />
      )}
      {groups.callToday.length > 0 && (
        <TodayGroup id="call-today" label="Call today" rows={groups.callToday} {...handlers} />
      )}
      {groups.laterThisWeek.length > 0 && (
        <CollapsedTodayGroup id="later-this-week" label="Later this week" rows={groups.laterThisWeek} {...handlers} />
      )}
    </>
  );
}
