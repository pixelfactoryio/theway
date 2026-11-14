/** The entries of the ⌘K search, grouped as the dialog lists them. Pure: no React, no DOM. */

import type { ChangeList } from "./changes";
import { appliesTo, filePath, type PromptRow, type WorkflowRow } from "./files";
import { byLabel, overviewPath, type Project } from "./projects";

/** One entry: its cmdk `value` (unique), the text shown, the text beside it, and the page it opens. */
export type SearchEntry = { value: string; label: string; detail: string; href: string };

/** A group of entries under its heading. */
export type SearchGroup = { heading: string; entries: SearchEntry[] };

/**
 * What the search lists: the current project's key (`null`: no Changes group), the lists loaded so far (`undefined`
 * while one loads: no entries from it) and a project's label.
 */
export type SearchInput = {
  key: string | null;
  changes: ChangeList | undefined;
  workflows: readonly WorkflowRow[] | undefined;
  prompts: readonly PromptRow[] | undefined;
  projects: readonly Project[] | undefined;
  label: (key: string) => string;
};

/** A workflow's or prompt's entry: its name, where it applies, its page. */
function fileEntry(kind: "workflows" | "prompts", row: { name: string; project: string | null }, label: (key: string) => string): SearchEntry {
  return {
    value: `${kind === "workflows" ? "workflow" : "prompt"}:${row.project ?? "global"}/${row.name}`,
    label: row.name,
    detail: appliesTo(row.project, label),
    href: `${filePath(kind, row.project, row.name)}?`,
  };
}

/** The groups Changes, Workflows, Prompts and Projects, in this order, an empty one dropped. */
export function searchGroups(input: SearchInput): SearchGroup[] {
  const { key, changes, label } = input;
  const changeEntries: SearchEntry[] =
    key === null || changes === undefined
      ? []
      : [
          ...changes.active.map((c) => ({
            value: `change:${c.id}`,
            label: c.id,
            detail: c.description ?? "",
            href: `/${key}/changes/${c.id}?`,
          })),
          ...changes.archived.map((a) => ({
            value: `archived:${a.dir}`,
            label: a.id,
            detail: `Archived ${a.date}`,
            href: `/${key}/changes/archive/${a.dir}?`,
          })),
        ];
  const groups: SearchGroup[] = [
    { heading: "Changes", entries: changeEntries },
    { heading: "Workflows", entries: (input.workflows ?? []).map((w) => fileEntry("workflows", w, label)) },
    { heading: "Prompts", entries: (input.prompts ?? []).map((p) => fileEntry("prompts", p, label)) },
    {
      heading: "Projects",
      entries: byLabel(input.projects ?? []).map((p) => ({
        value: `project:${p.key}`,
        label: p.label,
        detail: `${p.active} active`,
        href: overviewPath(p.key),
      })),
    },
  ];
  return groups.filter((g) => g.entries.length > 0);
}
