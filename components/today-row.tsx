import { RowAction } from "@/components/row-action";
import type { RunRowAction } from "@/components/today-list";
import { isLeaving, type RowPhase } from "@/lib/row-phases";
import type { RowView, Severity } from "@/lib/today-view";

const severityRule: Record<Severity, string | null> = {
  alert: "w-0.75 bg-alert",
  watch: "w-0.5 bg-watch",
  routine: null,
};

type TodayRowProps = {
  row: RowView;
  phase: RowPhase | undefined;
  onRun: RunRowAction;
};

export function TodayRow({ row, phase, onRun }: TodayRowProps) {
  const pending = phase?.stage === "pending";
  // From confirmed on, the row shows only what happened.
  const confirmed = phase !== undefined && !pending;
  const leaving = isLeaving(phase);
  const rule = confirmed ? "w-0.5 bg-steady" : severityRule[row.severity];

  return (
    <li
      inert={leaving}
      className={`grid transition-[grid-template-rows,opacity] duration-180 ease-out motion-reduce:transition-none ${
        leaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        {/* sm: spacing is tighter on wider screens, where more rows fit above the fold. */}
        <div className="relative mb-3 py-3 pl-4 sm:mb-2 sm:py-1.5">
          {rule && <span aria-hidden="true" className={`absolute inset-y-0 left-0 ${rule}`} />}

          {/* Announces "Saving rating…", then what happened. */}
          <p role="status" className="sr-only">
            {phase?.note ?? ""}
          </p>

          {/* Hidden, not removed, while the confirmation shows, so the row keeps its height. */}
          <div className={confirmed ? "invisible" : undefined}>
            <div className={pending ? "opacity-70" : undefined}>
              <h3 className="text-name text-chalk">{row.professional}</h3>
              <p className="mt-0.5 text-context text-mute">{row.context}</p>
              <p className="mt-2 text-pretty text-reason text-chalk sm:mt-1">{row.reason}</p>
              {row.escalationLine && (
                // No text-pretty here: its rebalancing moves the break away from the dash.
                <p className="mt-1 text-reason text-alert">{row.escalationLine}</p>
              )}
            </div>

            <RowAction
              action={row.action}
              professional={row.professional}
              pendingNote={pending ? phase.note : null}
              onRun={(note, save) => onRun(row, note, save)}
            />
          </div>

          {confirmed && (
            <p aria-hidden="true" className="absolute inset-0 flex items-center pr-4 pl-4 text-reason text-steady">
              {phase.note}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
