"use client";

// Client component: the rating and outcome pickers need local state, and a
// logged row has to leave the list before the server answers.

import { useState, useTransition } from "react";

import { logCheckIn, logFeedback, logFollowUp, markEscalated, type RowActionResult } from "@/app/actions";
import type { PlacementRows, RowActionView } from "@/lib/today-view";

const buttonClass =
  "flex min-h-11 w-full items-center justify-center border border-line bg-slate px-5 text-action text-chalk active:bg-line disabled:text-mute focus-visible:-outline-offset-4 sm:w-auto";
const choiceClass =
  "flex min-h-11 items-center justify-center border border-line bg-slate px-3 text-action text-chalk active:bg-line disabled:text-mute focus-visible:-outline-offset-4";
const cancelClass =
  "mt-2 flex min-h-11 items-center px-1 text-action text-mute active:text-chalk focus-visible:-outline-offset-4";

const LABELS: Record<RowActionView["kind"], string> = {
  feedback: "Log feedback",
  followUp: "Log follow-up",
  checkIn: "Log check-in",
  escalate: "Mark escalated",
};

type RowActionProps = {
  rowKey: string;
  action: RowActionView;
  professional: string;
  /** Removes the row optimistically. Called inside the transition. */
  onLeave: (rowKey: string) => void;
  /** Swaps in the placement's rows the server sent back. */
  onSaved: (rows: PlacementRows) => void;
};

export function RowAction({ rowKey, action, professional, onLeave, onSaved }: RowActionProps) {
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(save: () => Promise<RowActionResult>) {
    setError(null);
    startTransition(async () => {
      onLeave(rowKey);
      const result = await save();
      if (result.ok) {
        // Inside the transition, so the optimistic removal ends with the new rows in place.
        startTransition(() => onSaved(result.rows));
      } else {
        setChoosing(false);
        setError(result.message);
      }
    });
  }

  function start() {
    if (action.kind === "checkIn") submit(() => logCheckIn(action.checkInId));
    else if (action.kind === "escalate") {
      submit(() => markEscalated(action.placementId, action.rule, action.issueId));
    } else setChoosing(true);
  }

  const errorLine = error && (
    <p role="alert" className="mt-2 text-context text-alert">
      {error}
    </p>
  );

  if (choosing && action.kind === "feedback") {
    return (
      <fieldset className="mt-3 sm:mt-2" disabled={isPending}>
        <legend className="text-context text-mute">
          How is {action.contactName} finding it? 1 is unhappy, 5 is delighted.
        </legend>
        <div className="mt-2 grid grid-cols-5 gap-2 sm:max-w-sm">
          {[1, 2, 3, 4, 5].map((sentiment) => (
            <button
              key={sentiment}
              type="button"
              className={choiceClass}
              onClick={() => submit(() => logFeedback(action.placementId, sentiment))}
            >
              {sentiment}
            </button>
          ))}
        </div>
        <button type="button" className={cancelClass} onClick={() => setChoosing(false)}>
          Cancel
        </button>
        {errorLine}
      </fieldset>
    );
  }

  if (choosing && action.kind === "followUp") {
    return (
      <fieldset className="mt-3 sm:mt-2" disabled={isPending}>
        <legend className="text-context text-mute">Is the fix still holding?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-sm">
          <button
            type="button"
            className={choiceClass}
            onClick={() => submit(() => logFollowUp(action.followUpId, "HELD"))}
          >
            Still holding
          </button>
          <button
            type="button"
            className={choiceClass}
            onClick={() => submit(() => logFollowUp(action.followUpId, "REGRESSED"))}
          >
            Came back
          </button>
        </div>
        <button type="button" className={cancelClass} onClick={() => setChoosing(false)}>
          Cancel
        </button>
        {errorLine}
      </fieldset>
    );
  }

  // Left-aligned under the reason on every width, so the action stays next to
  // the row it belongs to.
  return (
    <div className="mt-3 sm:mt-2">
      <div className="sm:flex">
        <button type="button" className={buttonClass} disabled={isPending} onClick={start}>
          {LABELS[action.kind]}
          <span className="sr-only"> for {professional}</span>
        </button>
      </div>
      {errorLine}
    </div>
  );
}
