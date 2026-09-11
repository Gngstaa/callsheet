import { TodayRow } from "@/components/today-row";
import type { TodayRowData } from "@/lib/today";

type TodayGroupProps = {
  id: string;
  label: string;
  rows: TodayRowData[];
};

// top-10 keeps the label stuck directly under the 40px date bar.
const labelBar =
  "sticky top-10 z-10 flex min-h-11 items-center gap-2 border-t border-line bg-ink text-label text-mute";

function RowList({ rows }: { rows: TodayRowData[] }) {
  return (
    // role="list" because Safari drops list semantics when list-style is none.
    <ol role="list" className="flex flex-col gap-3 pb-6">
      {rows.map((row) => (
        <TodayRow key={row.id} row={row} />
      ))}
    </ol>
  );
}

export function TodayGroup({ id, label, rows }: TodayGroupProps) {
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={labelBar}>
        <span>{label}</span>
        <span>{rows.length}</span>
      </h2>
      <RowList rows={rows} />
    </section>
  );
}

/** Native details/summary, so it collapses without client JavaScript. */
export function CollapsedTodayGroup({ id, label, rows }: TodayGroupProps) {
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId}>
      <details className="group">
        <summary
          className={`${labelBar} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        >
          <h2 id={headingId} className="flex items-center gap-2">
            <span>{label}</span>
            <span>{rows.length}</span>
          </h2>
          <span aria-hidden="true" className="ml-auto group-open:hidden">
            Show
          </span>
          <span aria-hidden="true" className="ml-auto hidden group-open:inline">
            Hide
          </span>
        </summary>
        <RowList rows={rows} />
      </details>
    </section>
  );
}
