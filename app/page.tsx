import { connection } from "next/server";

import { DemoDataControl } from "@/components/demo-data-control";
import { ErrorState } from "@/components/error-state";
import { RememberLoad } from "@/components/remember-load";
import { TodayList } from "@/components/today-list";
import { describeError } from "@/lib/describe-error";
import { loadToday } from "@/lib/load-today";
import { OPERATIONAL_TIME_ZONE } from "@/lib/scoring";
import { timedSync, timingNote } from "@/lib/server-timing";
import { buildTodayView } from "@/lib/today-view";

const dateLabel = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: OPERATIONAL_TIME_ZONE,
});

const isoDate = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: OPERATIONAL_TIME_ZONE,
});

async function load() {
  const now = new Date();
  try {
    return { now, result: await loadToday(now) };
  } catch (error) {
    console.error(`Today failed to load: ${describeError(error)}`);
    return { now, result: null };
  }
}

export default async function TodayPage() {
  // Rendered per request. The date is the product; a build-time date is a bug.
  await connection();
  timingNote("page: render started");
  const { now, result } = await load();
  const view = result ? timedSync("page: build view", () => buildTodayView(result)) : null;
  timingNote("page: data ready, streaming HTML");

  return (
    <>
      <header className="sticky top-0 z-20 h-10 bg-slate">
        <div className="mx-auto flex h-full max-w-2xl items-center px-4">
          <time dateTime={isoDate.format(now)} className="text-label text-mute">
            {dateLabel.format(now)}
          </time>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-16 tabular-nums">
        <h1 className="sr-only">Today</h1>

        {view === null ? (
          <ErrorState message="Couldn't reach the database." />
        ) : (
          <>
            <RememberLoad loadedAt={now.toISOString()} />
            {view.placementIds.length > 0 ? (
              <>
                {/* Keyed by render time, so a full re-render (reset) replaces the list's local state. */}
                <TodayList key={now.toISOString()} initialView={view} />
                <div className="mt-8 border-t border-line pt-2">
                  <DemoDataControl mode="reset" />
                </div>
              </>
            ) : (
              <section aria-labelledby="no-data-heading" className="pt-6">
                <h2 id="no-data-heading" className="text-name text-chalk">
                  Nothing loaded yet.
                </h2>
                <p className="mt-1 text-reason text-mute">Load the demo set to see a working day.</p>
                <div className="mt-4">
                  <DemoDataControl mode="load" />
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
