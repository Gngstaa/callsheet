import type { Severity, TodayRowData } from "@/lib/today";

const severityRule: Record<Severity, string | null> = {
  alert: "w-0.75 bg-alert",
  watch: "w-0.5 bg-watch",
  routine: null,
};

export function TodayRow({ row }: { row: TodayRowData }) {
  const rule = severityRule[row.severity];

  return (
    <li className="relative py-3 pl-4">
      {rule && (
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 ${rule}`}
        />
      )}

      <h3 className="text-name text-chalk">{row.professional}</h3>
      <p className="mt-0.5 text-context text-mute">{row.context}</p>
      <p className="mt-2 text-pretty text-reason text-chalk">{row.reason}</p>
      {row.escalation && (
        // Non-breaking spaces keep the dash on the rule's line and
        // "needs <owner>" together when this wraps at 360px. No text-pretty
        // here: its rebalancing moves the break away from the dash.
        <p className="mt-1 text-reason text-alert">
          {`${row.escalation.rule}\u00a0— needs\u00a0${row.escalation.owner}.`}
        </p>
      )}

      <div className="mt-3 sm:flex sm:justify-end">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-center border border-line bg-slate px-5 text-action text-chalk active:bg-line sm:w-auto"
        >
          {row.action}
          <span className="sr-only"> for {row.professional}</span>
        </button>
      </div>
    </li>
  );
}
