/** What the Home and Changes pages compute from the API: rows, notices and badge variants. Pure: no DOM, no JSX. */
import type { ActiveChange, AllChangesResponse, ArchivedChange, Status, WorkflowItem } from "../../types";

export type Project = AllChangesResponse["projects"][number];

/** The project switcher's value for every project. */
export const ALL_PROJECTS = "";

/** The statuses, in the order of the Status select. */
export const STATUSES: readonly Status[] = ["Not started", "In progress", "Ready to archive", "Invalid"];

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** `1 <one>` or `<n> <many>`. */
export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The projects of the switcher's choice: every project for `ALL_PROJECTS`, else the one whose key it is. */
export const chosenProjects = (projects: readonly Project[], chosen: string): Project[] =>
  projects.filter((p) => chosen === ALL_PROJECTS || p.key === chosen);

/**
 * An active change with its project; `series` is its place in its series, whose total (its highest ordinal) comes from the
 * project's progress, which lists only series whose highest ordinal is 2 or more: a member missing from it is a lone `-01`.
 */
export type ChangeRow = { key: string; label: string; change: ActiveChange; series: { ordinal: number; total: number } | null };

/** The active changes of the chosen projects, ordered by project label then ID. */
function activeRows(projects: readonly Project[], chosen: string): ChangeRow[] {
  return chosenProjects(projects, chosen)
    .flatMap((p) =>
      p.active.map((change): ChangeRow => {
        const member = change.series;
        const total = member === null ? 0 : (p.series.find((s) => s.id === member.id)?.total ?? 1);
        return { key: p.key, label: p.label, change, series: member === null ? null : { ordinal: member.ordinal, total } };
      }),
    )
    .sort((a, b) => byText(a.label, b.label) || byText(a.change.id, b.change.id));
}

/** The number of active changes of the chosen projects. */
export const activeCount = (projects: readonly Project[], chosen: string): number =>
  chosenProjects(projects, chosen).reduce((n, p) => n + p.active.length, 0);

/** The Changes page's rows: the chosen projects' active changes of `status` (every status for `""`), ordered by project label then ID. */
export const changesRows = (projects: readonly Project[], chosen: string, status: Status | ""): ChangeRow[] =>
  activeRows(projects, chosen).filter((r) => status === "" || r.change.status === status);

/** An archived change with its project. */
export type ArchivedRow = { key: string; label: string; archived: ArchivedChange };

/**
 * The Changes page's archived rows: the chosen projects' archived changes that match `search` (by ID, folder, project
 * label or short name), newest first (by folder name), then by project label.
 */
export const archivedRows = (projects: readonly Project[], chosen: string, search = "", names: ReadonlyMap<string, string> = new Map()): ArchivedRow[] =>
  chosenProjects(projects, chosen)
    .flatMap((p) => p.archived.map((archived): ArchivedRow => ({ key: p.key, label: p.label, archived })))
    .filter((r) => matches(queryOf(search), [r.archived.id, r.archived.folder, r.label, names.get(r.label) ?? r.label]))
    .sort((a, b) => byText(b.archived.folder, a.archived.folder) || byText(a.label, b.label));

/** The Changes page's tabs: one per status, every status, and the archived changes. */
export type ChangesTab = Status | "All" | "Archived";

/** The tabs, in their order on the page. */
export const TABS: readonly ChangesTab[] = ["In progress", "Not started", "Ready to archive", "Invalid", "All", "Archived"];

/**
 * A listed entry of a status tab or All: a change alone, or a series of two or more active changes of one project with
 * all its members by ID, its tasks summed over its valid members (`null` when none is) and its status.
 */
export type ChangeEntry =
  | { kind: "change"; row: ChangeRow }
  | {
      kind: "series";
      key: string;
      label: string;
      id: string;
      members: ChangeRow[];
      tasks: { done: number; total: number } | null;
      status: Status;
    };

/** A series' status: Invalid when any member is, Ready to archive or Not started when all are, else In progress. */
export function seriesStatus(statuses: readonly Status[]): Status {
  if (statuses.includes("Invalid")) return "Invalid";
  if (statuses.every((s) => s === "Ready to archive")) return "Ready to archive";
  if (statuses.every((s) => s === "Not started")) return "Not started";
  return "In progress";
}

/** The search text as matched: trimmed and lower-cased. */
const queryOf = (search: string): string => search.trim().toLowerCase();

/** Whether `query` is empty or a substring of one of `fields`, each lower-cased. */
const matches = (query: string, fields: readonly (string | null)[]): boolean =>
  query === "" || fields.some((f) => f !== null && f.toLowerCase().includes(query));

/** Whether an active change matches `query`: by its ID, its description, its project's label or short name. */
const rowMatches = (row: ChangeRow, query: string, names: ReadonlyMap<string, string>): boolean =>
  matches(query, [row.change.id, row.change.description, row.label, names.get(row.label) ?? row.label]);

/** Whether an active change is counted in `tab`: it matches `query` and, for a status tab, has that status. */
const counted = (row: ChangeRow, tab: Status | "All", query: string, names: ReadonlyMap<string, string>): boolean =>
  rowMatches(row, query, names) && (tab === "All" || row.change.status === tab);

/**
 * The entries of a status tab or All: the active changes of the chosen projects, those of one project sharing a series
 * ID as one series entry when they are two or more. A change entry is listed when its change is counted, a series entry
 * when one of its members is. Ordered by project label, then by ID, a series entry at its series ID.
 */
export function changeEntries(
  projects: readonly Project[],
  chosen: string,
  tab: Status | "All",
  search: string,
  names: ReadonlyMap<string, string>,
): ChangeEntry[] {
  const query = queryOf(search);
  const groups = new Map<string, ChangeRow[]>();
  for (const row of activeRows(projects, chosen)) {
    const member = row.change.series;
    if (member === null) continue;
    const id = `${row.key}/${member.id}`;
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  const seen = new Set<string>();
  const out: { at: string; entry: ChangeEntry }[] = [];
  for (const row of activeRows(projects, chosen)) {
    const member = row.change.series;
    const group = member === null ? undefined : groups.get(`${row.key}/${member.id}`);
    if (member === null || group === undefined || group.length < 2) {
      if (counted(row, tab, query, names)) out.push({ at: row.change.id, entry: { kind: "change", row } });
      continue;
    }
    const id = `${row.key}/${member.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!group.some((r) => counted(r, tab, query, names))) continue;
    const valid = group.filter((r) => r.change.status !== "Invalid");
    const tasks =
      valid.length === 0
        ? null
        : valid.reduce((t, r) => ({ done: t.done + r.change.tasks.done, total: t.total + r.change.tasks.total }), { done: 0, total: 0 });
    out.push({
      at: member.id,
      entry: {
        kind: "series",
        key: row.key,
        label: row.label,
        id: member.id,
        members: group,
        tasks,
        status: seriesStatus(group.map((r) => r.change.status)),
      },
    });
  }
  const labelOf = (e: ChangeEntry): string => (e.kind === "change" ? e.row.label : e.label);
  return out.sort((a, b) => byText(labelOf(a.entry), labelOf(b.entry)) || byText(a.at, b.at)).map((o) => o.entry);
}

/** The count of each tab: the active changes counted in each status tab and in All, and the matching archived changes. */
export function tabCounts(projects: readonly Project[], chosen: string, search: string, names: ReadonlyMap<string, string>): Record<ChangesTab, number> {
  const query = queryOf(search);
  const rows = activeRows(projects, chosen);
  const count = (tab: Status | "All") => rows.filter((r) => counted(r, tab, query, names)).length;
  return {
    "In progress": count("In progress"),
    "Not started": count("Not started"),
    "Ready to archive": count("Ready to archive"),
    Invalid: count("Invalid"),
    All: count("All"),
    Archived: archivedRows(projects, chosen, search, names).length,
  };
}

/** The workflows that cannot run for the chosen project: the global ones, and those of the chosen project (of any for `ALL_PROJECTS`). */
export const brokenCount = (workflows: readonly WorkflowItem[], chosen: string): number =>
  workflows.filter((w) => w.error !== null && (w.scope === "global" || chosen === ALL_PROJECTS || w.key === chosen)).length;

/** The Badge variant of a status: a pale one. */
export function badgeVariant(status: Status): "primary-light" | "success-light" | "invert-light" | "destructive-light" {
  switch (status) {
    case "In progress":
      return "primary-light";
    case "Ready to archive":
      return "success-light";
    case "Not started":
      return "invert-light";
    case "Invalid":
      return "destructive-light";
  }
}
