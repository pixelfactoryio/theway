/** What the Home and Changes pages compute from the API: rows, notices and badge variants. Pure: no DOM, no JSX. */
import type { ActiveChange, AllChangesResponse, ArchivedChange, Status, WorkflowItem } from "../../types";
import { fileHref } from "./api";

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
 * An active change with its project; `series` is its place in its series, whose total comes from the project's progress,
 * which lists only series of two or more members: a member missing from it is alone in its series.
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

/** Home's "In progress" rows: the chosen projects' changes with status `In progress`, ordered by project label then ID. */
export const homeRows = (projects: readonly Project[], chosen: string): ChangeRow[] =>
  activeRows(projects, chosen).filter((r) => r.change.status === "In progress");

/** The Changes page's rows: the chosen projects' active changes of `status` (every status for `""`), ordered by project label then ID. */
export const changesRows = (projects: readonly Project[], chosen: string, status: Status | ""): ChangeRow[] =>
  activeRows(projects, chosen).filter((r) => status === "" || r.change.status === status);

/** An archived change with its project. */
export type ArchivedRow = { key: string; label: string; archived: ArchivedChange };

/** The Changes page's archived rows: the chosen projects' archived changes, newest first (by folder name), then by project label. */
export const archivedRows = (projects: readonly Project[], chosen: string): ArchivedRow[] =>
  chosenProjects(projects, chosen)
    .flatMap((p) => p.archived.map((archived): ArchivedRow => ({ key: p.key, label: p.label, archived })))
    .sort((a, b) => byText(b.archived.folder, a.archived.folder) || byText(a.label, b.label));

/** A Home notice: its sentence, and a link's text and route. */
export type Notice = { text: string; link: string; href: string };

/**
 * Home's notices for the chosen project: the workflows that cannot run (global ones count for every project), then the
 * changes whose `change.yaml` is invalid; each only when it applies.
 */
export function notices(projects: readonly Project[], workflows: readonly WorkflowItem[], chosen: string): Notice[] {
  const out: Notice[] = [];
  const broken = workflows.filter((w) => w.error !== null && (w.scope === "global" || chosen === ALL_PROJECTS || w.key === chosen));
  const first = broken[0];
  if (broken.length === 1 && first !== undefined) out.push({ text: `${first.name} cannot run.`, link: "Open it", href: fileHref(first) });
  else if (broken.length > 1) out.push({ text: `${broken.length} workflows cannot run.`, link: "See workflows", href: "/workflows" });
  const invalid = activeRows(projects, chosen).filter((r) => r.change.status === "Invalid").length;
  if (invalid > 0) {
    out.push({ text: `${plural(invalid, "change has", "changes have")} an invalid change.yaml.`, link: "See changes", href: "/changes" });
  }
  return out;
}

/** The Badge variant of a status. */
export function badgeVariant(status: Status): "default" | "success" | "secondary" | "destructive" {
  switch (status) {
    case "In progress":
      return "default";
    case "Ready to archive":
      return "success";
    case "Not started":
      return "secondary";
    case "Invalid":
      return "destructive";
  }
}
