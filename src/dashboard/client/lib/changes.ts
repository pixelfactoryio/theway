/** The changes of a project as the Changes page and the change page show them. Pure: no React, no DOM. */

/** The status of an active change, or `archived`. */
export type Status = "invalid" | "in-progress" | "not-started" | "ready" | "archived";

/** The statuses of an active change, in the order the page sorts and filters them. */
export const ACTIVE_STATUSES = ["invalid", "in-progress", "not-started", "ready"] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  invalid: "Invalid",
  "in-progress": "In progress",
  "not-started": "Not started",
  ready: "Ready to archive",
  archived: "Archived",
};

/** One active change of `GET /api/projects/:key/changes`. */
export type ActiveChange = {
  id: string;
  description: string | null;
  status: ActiveStatus;
  done: number;
  total: number;
  issues: string[];
  updated: string;
};

/** One archived change of `GET /api/projects/:key/changes`. */
export type ArchivedChange = { dir: string; id: string; date: string };

/** The body of `GET /api/projects/:key/changes`. */
export type ChangeList = { active: ActiveChange[]; archived: ArchivedChange[] };

export type ChangeTask = { text: string; done: boolean };

export type SeriesMember = {
  ordinal: string;
  active: string | null;
  archived: string | null;
  status: Status | null;
  done: number | null;
  total: number | null;
};

/** The body of `GET /api/projects/:key/changes/:id` and `…/changes/archive/:dir`. */
export type ChangeDetail = {
  id: string;
  archived: string | null;
  description: string | null;
  status: Status;
  done: number;
  total: number;
  issues: string[];
  tasks: ChangeTask[];
  /** The modification time of `change.yaml`, or of the folder when the file is missing, as an ISO string. */
  updated: string;
  folder: string;
  /** Each file's `version` (the SHA-256 of its bytes) on an active change only. */
  files: { name: string; text: string; version?: string }[];
  /** On an active change only: its `change.yaml`, `null` when it has none. */
  changeFile?: { text: string; version: string } | null;
  series: { id: string; members: SeriesMember[] } | null;
};

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const MEMBER = /^(.+)-(\d{2})$/;

/** The series ID and ordinal of a change ID ending in `-NN`, `null` otherwise. */
export function memberOf(id: string): { series: string; ordinal: string } | null {
  const m = MEMBER.exec(id);
  return m === null ? null : { series: m[1] as string, ordinal: m[2] as string };
}

/** A row of the Active grid: one change, or a series of two or more active changes with its members. */
export type ChangeRow = {
  kind: "change";
  id: string;
  change: ActiveChange;
};
export type SeriesRow = {
  kind: "series";
  id: string;
  status: ActiveStatus;
  /** The summed counts of its valid members, `null` when none is valid. */
  progress: { done: number; total: number } | null;
  updated: string;
  /** The number of its active members, whatever the search and the filter keep. */
  count: number;
  children: ChangeRow[];
};
export type ActiveRow = ChangeRow | SeriesRow;

/** A series' status: Invalid when a member is, Ready or Not started when all are, else In progress. */
export function seriesStatus(members: readonly ActiveChange[]): ActiveStatus {
  if (members.some((m) => m.status === "invalid")) return "invalid";
  if (members.every((m) => m.status === "ready")) return "ready";
  if (members.every((m) => m.status === "not-started")) return "not-started";
  return "in-progress";
}

/** The counts summed over the valid members, `null` when none is valid. */
export function seriesProgress(members: readonly ActiveChange[]): { done: number; total: number } | null {
  const valid = members.filter((m) => m.status !== "invalid");
  if (valid.length === 0) return null;
  return { done: valid.reduce((n, m) => n + m.done, 0), total: valid.reduce((n, m) => n + m.total, 0) };
}

/** Whether a change's ID or description holds `q`, ignoring case; every change when `q` is empty. */
export function matches(change: { id: string; description?: string | null }, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (needle === "") return true;
  return change.id.toLowerCase().includes(needle) || (change.description ?? "").toLowerCase().includes(needle);
}

/** The number of active changes of each status among those the search keeps. */
export function statusCounts(active: readonly ActiveChange[], q: string): Record<ActiveStatus, number> {
  const counts = { invalid: 0, "in-progress": 0, "not-started": 0, ready: 0 };
  for (const c of active) if (matches(c, q)) counts[c.status] += 1;
  return counts;
}

/**
 * The rows of the Active grid: the changes the search and the status filter keep, two or more active changes of one
 * series grouped under a series row (members in ordinal order, listing only those kept; its status, progress, Updated
 * and count over all its active members). In the default order: status, then ID.
 */
export function activeRows(active: readonly ActiveChange[], q: string, statuses: readonly ActiveStatus[]): ActiveRow[] {
  const groups = new Map<string, ActiveChange[]>();
  for (const c of active) {
    const m = memberOf(c.id);
    if (m !== null) groups.set(m.series, [...(groups.get(m.series) ?? []), c]);
  }
  const kept = (c: ActiveChange): boolean => matches(c, q) && (statuses.length === 0 || statuses.includes(c.status));
  const rows: ActiveRow[] = [];
  const seen = new Set<string>();
  for (const c of active) {
    const series = memberOf(c.id)?.series;
    const members = series === undefined ? undefined : groups.get(series);
    if (series === undefined || members === undefined || members.length < 2) {
      if (kept(c)) rows.push({ kind: "change", id: c.id, change: c });
      continue;
    }
    if (seen.has(series)) continue;
    seen.add(series);
    const children = members
      .filter(kept)
      .sort((a, b) => byId(memberOf(a.id)?.ordinal ?? "", memberOf(b.id)?.ordinal ?? "") || byId(a.id, b.id))
      .map((m): ChangeRow => ({ kind: "change", id: m.id, change: m }));
    if (children.length === 0) continue;
    rows.push({
      kind: "series",
      id: series,
      status: seriesStatus(members),
      progress: seriesProgress(members),
      updated: members.reduce((u, m) => (m.updated > u ? m.updated : u), ""),
      count: members.length,
      children,
    });
  }
  return sortRows(rows, null);
}

/** Which series rows are open: `true` (every row) or one flag per series ID, as the grid's expanded state. */
export type SeriesOpen = true | Record<string, boolean>;

/**
 * The series rows' open state, kept apart for the view no search or filter narrows (`whole`) and for the narrowing in
 * force (`narrowed`, under its key).
 */
export type SeriesExpansion = { whole: SeriesOpen; narrowed: { key: string; open: SeriesOpen } | null };

/** Every series row closed. */
export const SERIES_CLOSED: SeriesExpansion = { whole: {}, narrowed: null };

/**
 * The open series rows shown for `key` (`""`: not narrowed): the whole view's own state; for a narrowing, its state
 * once changed, else every series of `rows` opened.
 */
export function shownSeriesOpen(state: SeriesExpansion, key: string, rows: readonly ActiveRow[]): SeriesOpen {
  if (key === "") return state.whole;
  if (state.narrowed?.key === key) return state.narrowed.open;
  return Object.fromEntries(rows.filter((r) => r.kind === "series").map((r) => [r.id, true]));
}

/** `state` with `open` kept for `key`: the whole view's state stays as it was while a narrowing changes its own. */
export const keepSeriesOpen = (state: SeriesExpansion, key: string, open: SeriesOpen): SeriesExpansion =>
  key === "" ? { ...state, whole: open } : { ...state, narrowed: { key, open } };

/** A row's status. */
export const rowStatus = (row: ActiveRow): ActiveStatus => (row.kind === "series" ? row.status : row.change.status);

/** A row's fraction of tasks done: an Invalid change, or a series with no valid member, lowest. */
export function rowFraction(row: ActiveRow): number {
  const p = row.kind === "series" ? row.progress : row.change.status === "invalid" ? null : row.change;
  if (p === null) return -1;
  return p.total === 0 ? 0 : p.done / p.total;
}

const rowUpdated = (row: ActiveRow): string => (row.kind === "series" ? row.updated : row.change.updated);

/** The sortable columns of the Active grid. */
export type SortColumn = "change" | "status" | "progress" | "updated";

/**
 * `rows` ordered by `sort` (`null`: the default order, status then ID), ties broken by ID; a series' members keep their
 * ordinal order.
 */
export function sortRows(rows: readonly ActiveRow[], sort: { column: SortColumn; desc: boolean } | null): ActiveRow[] {
  const rank = (r: ActiveRow): number => ACTIVE_STATUSES.indexOf(rowStatus(r));
  const compare = (a: ActiveRow, b: ActiveRow): number => {
    if (sort === null) return rank(a) - rank(b) || byId(a.id, b.id);
    const sign = sort.desc ? -1 : 1;
    let v = 0;
    if (sort.column === "change") v = byId(a.id, b.id);
    else if (sort.column === "status") v = rank(a) - rank(b);
    else if (sort.column === "progress") v = rowFraction(a) - rowFraction(b);
    else v = byId(rowUpdated(a), rowUpdated(b));
    return sign * v || byId(a.id, b.id);
  };
  return [...rows].sort(compare);
}

/** The number of changes `rows` hold: a series row counts its listed members. */
export const changeCount = (rows: readonly ActiveRow[]): number =>
  rows.reduce((n, r) => n + (r.kind === "series" ? r.children.length : 1), 0);

/** The toolbar's count: `N changes`, or `N of M changes` while narrowed. */
export function countText(shown: number, all: number, narrowed: boolean): string {
  const noun = (n: number): string => (n === 1 ? "change" : "changes");
  return narrowed ? `${shown} of ${all} ${noun(all)}` : `${shown} ${noun(shown)}`;
}

/** The archived changes whose ID holds `q`, ignoring case. */
export const archivedRows = (archived: readonly ArchivedChange[], q: string): ArchivedChange[] =>
  archived.filter((a) => matches({ id: a.id }, q));

/** The Archived page sizes. */
export const PAGE_SIZES = [25, 50, 100] as const;

/** The Changes page's state in the address. */
export type ChangesQuery = {
  view: "active" | "archived";
  q: string;
  statuses: ActiveStatus[];
  page: number;
  size: number;
};

/** The state of the search part `search` (with or without its `?`): invalid values read as their defaults. */
export function parseQuery(search: string): ChangesQuery {
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  const view = params.get("view") === "archived" ? "archived" : "active";
  const wanted = (params.get("status") ?? "").split(",");
  const statuses = ACTIVE_STATUSES.filter((s) => wanted.includes(s));
  const pageText = params.get("page") ?? "";
  const page = /^\d+$/.test(pageText) && Number(pageText) >= 1 ? Number(pageText) : 1;
  const size = Number(params.get("size"));
  return {
    view,
    q: params.get("q") ?? "",
    statuses,
    page: Number.isSafeInteger(page) ? page : 1,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : 25,
  };
}

/** The search part of a state, without its `?`: `view`, `q`, `status`, `page` and `size`, each absent at its default. */
export function queryString(query: ChangesQuery): string {
  const params = new URLSearchParams();
  if (query.view === "archived") params.set("view", "archived");
  if (query.q !== "") params.set("q", query.q);
  const statuses = ACTIVE_STATUSES.filter((s) => query.statuses.includes(s));
  if (query.view === "active" && statuses.length > 0) params.set("status", statuses.join(","));
  if (query.view === "archived" && query.page > 1) params.set("page", String(query.page));
  if (query.view === "archived" && query.size !== 25) params.set("size", String(query.size));
  return params.toString().replace(/%2C/g, ",");
}

/** The state after switching to `view`: the search kept, the page and the statuses dropped. */
export const switchView = (query: ChangesQuery, view: ChangesQuery["view"]): ChangesQuery => ({
  ...query,
  view,
  statuses: [],
  page: 1,
});

/** The 0-based page shown for the 1-based `page`: the last page when past the end. */
export function shownPage(page: number, rows: number, size: number): number {
  const last = Math.max(0, Math.ceil(rows / size) - 1);
  return Math.min(page - 1, last);
}

/** The browser's local date of an ISO time, `YYYY-MM-DD`. */
export function localDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** One tab of the change page: a Markdown file or the Tasks. */
export type ChangeTab = { slug: string; label: string; file: string | null };

/** A Markdown file's tab: its name without `.md` (`tasks-md` for `tasks.md`), labelled with a capital first letter. */
export function fileTab(name: string): ChangeTab {
  const base = name.replace(/\.md$/, "");
  return { slug: name === "tasks.md" ? "tasks-md" : base, label: base.charAt(0).toUpperCase() + base.slice(1), file: name };
}

/** The tabs of a change: one per Markdown file in the route's order, then Tasks. */
export const changeTabs = (files: readonly { name: string }[]): ChangeTab[] => [
  ...files.map((f) => fileTab(f.name)),
  { slug: "tasks", label: "Tasks", file: null },
];

/** The tab shown for the address' `slug`: that tab when the change has it, else the first. */
export function shownTab(tabs: readonly ChangeTab[], slug: string | undefined): ChangeTab {
  return tabs.find((t) => t.slug === slug) ?? (tabs[0] as ChangeTab);
}

/** The number (from 1) and text of the first task not done, `null` when all are done. */
export function nextTask(tasks: readonly ChangeTask[]): { n: number; text: string } | null {
  const i = tasks.findIndex((t) => !t.done);
  return i === -1 ? null : { n: i + 1, text: (tasks[i] as ChangeTask).text };
}

/** The command the change page offers: archive when every task is done and the change is valid, else workflow. */
export function runCommand(change: Pick<ChangeDetail, "id" | "status" | "done" | "total">): { command: string; name: string } {
  if (change.status !== "invalid" && change.total > 0 && change.done === change.total) {
    return { command: `/theway:archive ${change.id}`, name: "the archive command" };
  }
  return { command: `/theway:workflow ${change.id}`, name: "the run command" };
}

/**
 * The command to copy for an active row, `null` for an Invalid one. A change: the change page's command
 * (`runCommand`). A series (members sorted by ID): `/theway:archive` of its first member when Ready, else
 * `/theway:workflow` of its first member that is not Ready.
 */
export function nextCommand(row: ActiveRow, active: readonly ActiveChange[]): string | null {
  if (rowStatus(row) === "invalid") return null;
  if (row.kind === "change") return runCommand(row.change).command;
  const members = active.filter((c) => memberOf(c.id)?.series === row.id).sort((a, b) => byId(a.id, b.id));
  if (row.status === "ready") return `/theway:archive ${(members[0] as ActiveChange).id}`;
  const next = members.find((m) => m.status !== "ready") ?? (members[0] as ActiveChange);
  return `/theway:workflow ${next.id}`;
}

/** The active rows grouped by row status, in the order Invalid, In progress, Not started, Ready; empty groups dropped. */
export function actionGroups(active: readonly ActiveChange[]): { status: ActiveStatus; rows: ActiveRow[] }[] {
  const rows = activeRows(active, "", []);
  return ACTIVE_STATUSES.map((status) => ({ status, rows: rows.filter((r) => rowStatus(r) === status) })).filter(
    (g) => g.rows.length > 0,
  );
}

/** A task's text cut into plain and code parts at its backtick spans; the backticks are dropped. */
export function inlineCode(text: string): { code: boolean; text: string }[] {
  const parts: { code: boolean; text: string }[] = [];
  const re = /`([^`\n]+)`/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > at) parts.push({ code: false, text: text.slice(at, start) });
    parts.push({ code: true, text: m[1] as string });
    at = start + m[0].length;
  }
  if (at < text.length) parts.push({ code: false, text: text.slice(at) });
  return parts;
}

/** Whether a Markdown link target is shown as a link: `http:`, `https:` and `mailto:` only. */
export function isLinkTarget(href: string | undefined | null): boolean {
  return typeof href === "string" && /^(?:https?:|mailto:)/i.test(href.trim());
}

/** The tag a Markdown heading of source level `depth` renders as: one level down, at most `h6`. */
export const headingTag = (depth: number): string => `h${Math.min(depth + 1, 6)}`;
