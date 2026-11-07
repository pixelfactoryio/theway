/** Groups active changes into series rows for the Changes page. Pure: no DOM, no JSX. */
import type { ActiveChange, Status } from "../../types";

/** A row of the Changes table: a series of two or more members, or one change on its own. */
export type Row =
  | { kind: "series"; id: string; members: ActiveChange[]; status: Status }
  | { kind: "change"; id: string; change: ActiveChange; status: Status };

/** The order of the rows by status. */
export const STATUS_ORDER: Status[] = ["In progress", "Not started", "No tasks", "Ready to archive"];

/**
 * The status of a series from its members' statuses: "No tasks" when every member has none; otherwise, over the
 * members that have tasks, "Ready to archive" or "Not started" when every one is, "In progress" else.
 */
export function seriesStatus(statuses: Status[]): Status {
  const counted = statuses.filter((s) => s !== "No tasks");
  if (counted.length === 0) return "No tasks";
  if (counted.every((s) => s === "Ready to archive")) return "Ready to archive";
  if (counted.every((s) => s === "Not started")) return "Not started";
  return "In progress";
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The rows of the active changes: series members grouped and sorted by ordinal, rows ordered by status, then ID. */
export function rowsOf(active: ActiveChange[]): Row[] {
  const series = new Map<string, ActiveChange[]>();
  for (const c of active) {
    if (c.series === null) continue;
    const members = series.get(c.series.id) ?? [];
    members.push(c);
    series.set(c.series.id, members);
  }
  const rows: Row[] = [];
  for (const c of active) {
    const members = c.series === null ? undefined : series.get(c.series.id);
    if (members === undefined || members.length < 2) {
      rows.push({ kind: "change", id: c.id, change: c, status: c.status });
    } else if (members[0] === c) {
      const sorted = [...members].sort((a, b) => (a.series?.ordinal ?? 0) - (b.series?.ordinal ?? 0));
      rows.push({ kind: "series", id: c.series?.id as string, members: sorted, status: seriesStatus(sorted.map((m) => m.status)) });
    }
  }
  return rows.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || byText(a.id, b.id));
}
