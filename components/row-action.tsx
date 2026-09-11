"use client";

// Client component: the rating and outcome pickers need local state, and the
// row has to say it is saving while the write is in flight.

import { useEffect, useRef, useState } from "react";

import { logCheckIn, logFeedback, logFollowUp, markEscalated, type RowActionResult } from "@/app/actions";
import type { RowActionView } from "@/lib/today-view";

const buttonClass =
  "flex min-h-11 w-full items-center justify-center border border-line bg-slate px-5 text-action text-chalk active:bg-line disabled:text-mute focus-visible:-outline-offset-4 sm:w-auto";
const choiceClass =
  "flex min-h-11 items-center justify-center border border-line bg-slate px-3 text-action text-chalk active:bg-line disabled:text-mute focus-visible:-outline-offset-4";
const cancelClass =
  "mt-2 flex min-h-11 items-center px-1 text-action text-mute active:text-chalk focus-visible:-outline-offset-4";
// Same height as the button or Cancel it stands in for, so the row does not move.
const pendingClass = "flex min-h-11 items-center text-action text-mute";

const LABELS: Record<RowActionView["kind"], string> = {
  feedback: "Log feedback",
  followUp: "Log follow-up",
  checkIn: "Log check-in",
  escalate: "Mark escalated",
};

const PENDING_NOTES: Record<RowActionView["kind"], string> = {
  feedback: "Saving rating…",
  followUp: "Recording follow-up…",
  checkIn: "Logging check-in…",
  escalate: "Escalating…",
};

type RowActionProps = {
  action: RowActionView;
  professional: string;
  /** Set while this row's write is in flight. */
  pendingNote: string | null;
  onRun: (pendingNote: string, save: () => Promise<RowActionResult>) => Promise<RowActionResult>;
};

export function RowAction({ action, professional, pendingNote, onRun }: RowActionProps) {
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionButton = useRef<HTMLButtonElement>(null);
  const pending = pendingNote !== null;

  // After a failed write, put focus back on the action so it can be tried again.
  useEffect(() => {
    if (error) actionButton.current?.focus();
  }, [error]);

  async function submit(save: () => Promise<RowActionResult>) {
    setError(null);
    const result = await onRun(PENDING_NOTES[action.kind], save);
    if (!result.ok) {
      setChoosing(false);
      setError(result.message);
    }
  }

  function start() {
    if (action.kind === "checkIn") void submit(() => logCheckIn(action.checkInId));
    else if (action.kind === "escalate") {
      void submit(() => markEscalated(action.placementId, action.rule, action.issueId));
    } else setChoosing(true);
  }

  const errorLine = error && (
    <p role="alert" className="mt-2 text-context text-alert">
      {error}
    </p>
  );

  // While saving, the picker stays where it is, disabled, and the note takes Cancel's place.
  const cancelOrPending = pending ? (
    <p aria-hidden="true" className={`mt-2 ${pendingClass}`}>
      {pendingNote}
    </p>
  ) : (
    <button type="button" className={cancelClass} onClick={() => setChoosing(false)}>
      Cancel
    </button>
  );

  if (choosing && action.kind === "feedback") {
    return (
      <fieldset className="mt-3 sm:mt-2" disabled={pending}>
        <legend className="text-context text-mute">
          How is {action.contactName} finding it? 1 is unhappy, 5 is delighted.
        </legend>
        <div className="mt-2 grid grid-cols-5 gap-2 sm:max-w-sm">
          {[1, 2, 3, 4, 5].map((sentiment) => (
            <button
              key={sentiment}
              type="button"
              className={choiceClass}
              onClick={() => void submit(() => logFeedback(action.placementId, sentiment))}
            >
              {sentiment}
            </button>
          ))}
        </div>
        {cancelOrPending}
        {errorLine}
      </fieldset>
    );
  }

  if (choosing && action.kind === "followUp") {
    return (
      <fieldset className="mt-3 sm:mt-2" disabled={pending}>
        <legend className="text-context text-mute">Is the fix still holding?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-sm">
          <button
            type="button"
            className={choiceClass}
            onClick={() => void submit(() => logFollowUp(action.followUpId, "HELD"))}
          >
            Still holding
          </button>
          <button
            type="button"
            className={choiceClass}
            onClick={() => void submit(() => logFollowUp(action.followUpId, "REGRESSED"))}
          >
            Came back
          </button>
        </div>
        {cancelOrPending}
        {errorLine}
      </fieldset>
    );
  }

  // Left-aligned under the reason on every width, so the action stays next to
  // the row it belongs to.
  return (
    <div className="mt-3 sm:mt-2">
      <div className="sm:flex">
        {pending ? (
          <p aria-hidden="true" className={pendingClass}>
            {pendingNote}
          </p>
        ) : (
          <button ref={actionButton} type="button" className={buttonClass} onClick={start}>
            {LABELS[action.kind]}
            <span className="sr-only"> for {professional}</span>
          </button>
        )}
      </div>
      {errorLine}
    </div>
  );
}
