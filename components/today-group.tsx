import { TodayRow } from "@/components/today-row";
import type { PlacementRows, RowView } from "@/lib/today-view";

type TodayGroupProps = {
  id: string;
  label: string;
  rows: readonly RowView[];
  leaving: ReadonlySet<string>;
  onLeave: (rowKey: string) => void;
  onSaved: (rows: PlacementRows) => void;
};

// top-10 keeps the label stuck directly under the 40px date bar.
const labelBar =
  "sticky top-10 z-10 flex min-h-11 items-center gap-2 border-t border-line bg-ink text-label text-mute";

function RowList({ rows, leaving, onLeave, onSaved }: Omit<TodayGroupProps, "id" | "label">) {
  return (
    // role="list" because Safari drops list semantics when list-style is none.
    <ol role="list" className="pb-3">
      {rows.map((row) => (
        <TodayRow key={row.key} row={row} leaving={leaving.has(row.key)} onLeave={onLeave} onSaved={onSaved} />
      ))}
    </ol>
  );
}

function visibleCount(rows: readonly RowView[], leaving: ReadonlySet<string>): number {
  return rows.filter((row) => !leaving.has(row.key)).length;
}

export function TodayGroup({ id, label, rows, ...handlers }: TodayGroupProps) {
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={labelBar}>
        <span>{label}</span>
        <span>{visibleCount(rows, handlers.leaving)}</span>
      </h2>
      <RowList rows={rows} {...handlers} />
    </section>
  );
}

/** Native details/summary, so it opens and closes without extra state. */
export function CollapsedTodayGroup({ id, label, rows, ...handlers }: TodayGroupProps) {
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId}>
      <details className="group">
        <summary
          className={`${labelBar} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        >
          <h2 id={headingId} className="flex items-center gap-2">
            <span>{label}</span>
            <span>{visibleCount(rows, handlers.leaving)}</span>
          </h2>
          <span aria-hidden="true" className="ml-auto group-open:hidden">
            Show
          </span>
          <span aria-hidden="true" className="ml-auto hidden group-open:inline">
            Hide
          </span>
        </summary>
        <RowList rows={rows} {...handlers} />
      </details>
    </section>
  );
}
