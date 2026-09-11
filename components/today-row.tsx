import { RowAction } from "@/components/row-action";
import type { PlacementRows, RowView, Severity } from "@/lib/today-view";

const severityRule: Record<Severity, string | null> = {
  alert: "w-0.75 bg-alert",
  watch: "w-0.5 bg-watch",
  routine: null,
};

type TodayRowProps = {
  row: RowView;
  /** Logged and on its way out: collapses over 180ms, instantly with reduced motion. */
  leaving: boolean;
  onLeave: (rowKey: string) => void;
  onSaved: (rows: PlacementRows) => void;
};

export function TodayRow({ row, leaving, onLeave, onSaved }: TodayRowProps) {
  const rule = severityRule[row.severity];

  return (
    <li
      inert={leaving}
      className={`grid transition-[grid-template-rows,opacity] duration-180 ease-out motion-reduce:transition-none ${
        leaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="relative mb-3 py-3 pl-4">
          {rule && <span aria-hidden="true" className={`absolute inset-y-0 left-0 ${rule}`} />}

          <h3 className="text-name text-chalk">{row.professional}</h3>
          <p className="mt-0.5 text-context text-mute">{row.context}</p>
          <p className="mt-2 text-pretty text-reason text-chalk">{row.reason}</p>
          {row.escalationLine && (
            // No text-pretty here: its rebalancing moves the break away from the dash.
            <p className="mt-1 text-reason text-alert">{row.escalationLine}</p>
          )}

          <RowAction
            rowKey={row.key}
            action={row.action}
            professional={row.professional}
            onLeave={onLeave}
            onSaved={onSaved}
          />
        </div>
      </div>
    </li>
  );
}
