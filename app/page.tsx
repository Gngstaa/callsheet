import { CollapsedTodayGroup, TodayGroup } from "@/components/today-group";
import {
  REFERENCE_DATE,
  callToday,
  escalateNow,
  laterThisWeek,
} from "@/lib/demo-today";

const dateLabel = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export default function TodayPage() {
  return (
    <>
      <header className="sticky top-0 z-20 h-10 bg-slate">
        <div className="mx-auto flex h-full max-w-2xl items-center px-4">
          <time
            dateTime={REFERENCE_DATE.toISOString().slice(0, 10)}
            className="text-label text-mute"
          >
            {dateLabel.format(REFERENCE_DATE)}
          </time>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-16 tabular-nums">
        <h1 className="sr-only">Today</h1>
        <TodayGroup id="escalate-now" label="Escalate now" rows={escalateNow} />
        <TodayGroup id="call-today" label="Call today" rows={callToday} />
        <CollapsedTodayGroup
          id="later-this-week"
          label="Later this week"
          rows={laterThisWeek}
        />
      </main>
    </>
  );
}
