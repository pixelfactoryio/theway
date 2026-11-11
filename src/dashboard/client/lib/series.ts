/** Groups active changes into series rows for the Changes page. Pure: no DOM, no JSX. */
import type { ActiveChange, SeriesProgress } from "../../types";

/** A row of the Changes page: a series with its active members and its progress, or one change on its own. */
export type Row =
  | { kind: "series"; id: string; members: ActiveChange[]; done: number; total: number }
  | { kind: "change"; id: string; change: ActiveChange };

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The rows of a project's active changes: an active change whose series is in `series` joins that series' row, even
 * as its only active member, members sorted by ordinal; every other change is a row of its own. Rows are sorted by ID.
 */
export function rowsOf(active: ActiveChange[], series: SeriesProgress[]): Row[] {
  const progress = new Map(series.map((s) => [s.id, s]));
  const members = new Map<string, ActiveChange[]>();
  const rows: Row[] = [];
  for (const c of active) {
    const s = c.series === null ? undefined : progress.get(c.series.id);
    if (s === undefined) {
      rows.push({ kind: "change", id: c.id, change: c });
      continue;
    }
    const list = members.get(s.id);
    if (list !== undefined) {
      list.push(c);
      continue;
    }
    const first = [c];
    members.set(s.id, first);
    rows.push({ kind: "series", id: s.id, members: first, done: s.done, total: s.total });
  }
  for (const list of members.values()) list.sort((a, b) => (a.series?.ordinal ?? 0) - (b.series?.ordinal ?? 0));
  return rows.sort((a, b) => byText(a.id, b.id));
}
