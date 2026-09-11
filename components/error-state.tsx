"use client";

// Client component for the retry button and for reading the last good load
// from the browser.

import { useRouter } from "next/navigation";
import { useSyncExternalStore, useTransition } from "react";

import { readLastLoaded, subscribeToLastLoaded } from "@/components/remember-load";

function lastLoadedLine(iso: string | null): string {
  const loadedAt = iso ? new Date(iso) : null;
  if (!loadedAt || Number.isNaN(loadedAt.getTime())) return "Nothing has loaded on this device yet.";

  const time = loadedAt
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(/\s/g, "")
    .toLowerCase();
  const sameDay = loadedAt.toDateString() === new Date().toDateString();
  const day = sameDay ? "" : `${loadedAt.toLocaleDateString("en-GB", { weekday: "long" })} `;
  return `Last loaded ${day}${time}.`;
}

export function ErrorState({ message, reset }: { message: string; reset?: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const lastLoaded = useSyncExternalStore(subscribeToLastLoaded, readLastLoaded, () => null);

  return (
    <section aria-labelledby="error-heading" className="pt-6">
      <h2 id="error-heading" className="text-name text-chalk">
        {message}
      </h2>
      <p className="mt-1 text-reason text-mute">{lastLoadedLine(lastLoaded)}</p>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            router.refresh();
            reset?.();
          })
        }
        className="mt-4 flex min-h-11 w-full items-center justify-center border border-line bg-slate px-5 text-action text-chalk active:bg-line disabled:text-mute sm:w-auto"
      >
        {isPending ? "Trying again…" : "Try again"}
      </button>
    </section>
  );
}
