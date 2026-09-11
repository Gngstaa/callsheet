"use client";

// Client component for the confirm step and the pending state while the
// demo set is written.

import { useState, useTransition } from "react";

import { resetDemo } from "@/app/actions";

const buttonClass =
  "flex min-h-11 w-full items-center justify-center border border-line bg-slate px-5 text-action text-chalk active:bg-line disabled:text-mute sm:w-auto";
const quietButtonClass =
  "flex min-h-11 items-center px-1 text-action text-mute active:text-chalk disabled:text-mute";

export function DemoDataControl({ mode }: { mode: "load" | "reset" }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await resetDemo();
      setConfirming(false);
      if (!result.ok) setError(result.message);
    });
  }

  const errorLine = error && (
    <p role="alert" className="mt-2 text-context text-alert">
      {error}
    </p>
  );

  if (mode === "load") {
    return (
      <div>
        <button type="button" onClick={run} disabled={isPending} className={buttonClass}>
          {isPending ? "Loading the demo set…" : "Load demo data"}
        </button>
        {errorLine}
      </div>
    );
  }

  if (!confirming) {
    return (
      <div>
        <button type="button" onClick={() => setConfirming(true)} className={quietButtonClass}>
          Reset demo data
        </button>
        {errorLine}
      </div>
    );
  }

  return (
    <div className="py-2">
      <p className="text-context text-mute">
        This replaces everything, including anything logged today, with the demo set.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="button" onClick={run} disabled={isPending} className={buttonClass}>
          {isPending ? "Resetting…" : "Reset everything"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className={quietButtonClass}
        >
          Cancel
        </button>
      </div>
      {errorLine}
    </div>
  );
}
