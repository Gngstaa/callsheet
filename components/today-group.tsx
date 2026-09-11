import type { RunRowAction } from "@/components/today-list";
import { TodayRow } from "@/components/today-row";
import { isLeaving, type RowPhase } from "@/lib/row-phases";
import type { RowView } from "@/lib/today-view";

type TodayGroupProps = {
  id: string;
  label: string;
  rows: readonly RowView[];
  phases: Readonly<Record<string, RowPhase>>;
  onRun: RunRowAction;
};

// top-10 keeps the label stuck directly under the 40px date bar. A little
// shorter from sm up, where more rows fit above the fold.
const labelBar =
  "sticky top-10 z-10 flex min-h-11 items-center gap-2 border-t border-line bg-ink text-label text-mute sm:min-h-10";

function RowList({ rows, phases, onRun }: Omit<TodayGroupProps, "id" | "label">) {
  return (
    // role="list" because Safari drops list semantics when list-style is none.
    <ol role="list" className="pb-3">
      {rows.map((row) => (
        <TodayRow key={row.key} row={row} phase={phases[row.key]} onRun={onRun} />
      ))}
    </ol>
  );
}

/** Rows stop counting when they start to collapse, not when they confirm. */
function visibleCount(rows: readonly RowView[], phases: Readonly<Record<string, RowPhase>>): number {
  return rows.filter((row) => !isLeaving(phases[row.key])).length;
}

export function TodayGroup({ id, label, rows, ...shared }: TodayGroupProps) {
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={labelBar}>
        <span>{label}</span>
        <span>{visibleCount(rows, shared.phases)}</span>
      </h2>
      <RowList rows={rows} {...shared} />
    </section>
  );
}

/** Native details/summary, so it opens and closes without extra state. */
export function CollapsedTodayGroup({ id, label, rows, ...shared }: TodayGroupProps) {
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId}>
      <details className="group">
        <summary
          className={`${labelBar} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        >
          <h2 id={headingId} className="flex items-center gap-2">
            <span>{label}</span>
            <span>{visibleCount(rows, shared.phases)}</span>
          </h2>
          <span aria-hidden="true" className="ml-auto group-open:hidden">
            Show
          </span>
          <span aria-hidden="true" className="ml-auto hidden group-open:inline">
            Hide
          </span>
        </summary>
        <RowList rows={rows} {...shared} />
      </details>
    </section>
  );
}
