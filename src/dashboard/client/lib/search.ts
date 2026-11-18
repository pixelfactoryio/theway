/** The entries of the ⌘K search, grouped as the dialog lists them. Pure: no React, no DOM. */

import type { ChangeList } from "./changes"
import { appliesTo, type PromptRow, type WorkflowRow } from "./files"
import { byLabel, type Project } from "./projects"
import { to } from "./routes"

/** One entry: its cmdk `value` (unique), the text shown, the text beside it, and the page it opens. */
export type SearchEntry = { value: string; label: string; detail: string; href: string }

/** A group of entries under its heading. */
type SearchGroup = { heading: string; entries: SearchEntry[] }

/**
 * What the search lists: each project's change list loaded so far (with its key), the lists of workflows, prompts and
 * projects (`undefined` while one loads: no entries from it) and a project's label.
 */
export type SearchInput = {
  changes: readonly { key: string; list: ChangeList }[]
  workflows: readonly WorkflowRow[] | undefined
  prompts: readonly PromptRow[] | undefined
  projects: readonly Project[] | undefined
  label: (key: string) => string
}

/** A workflow's or prompt's entry: its name, where it applies, its page. */
function fileEntry(
  kind: "workflows" | "prompts",
  row: { name: string; project: string | null },
  label: (key: string) => string,
): SearchEntry {
  return {
    value: `${kind === "workflows" ? "workflow" : "prompt"}:${row.project ?? "global"}/${row.name}`,
    label: row.name,
    detail: appliesTo(row.project, label),
    href: to.file(kind, row.project, row.name),
  }
}

/** The groups Changes, Workflows, Prompts and Projects, in this order, an empty one dropped. */
export function searchGroups(input: SearchInput): SearchGroup[] {
  const { label } = input
  // Every project's active changes first, then the archives, each detail naming the project.
  const changeEntries: SearchEntry[] = [
    ...input.changes.flatMap(({ key, list }) =>
      list.active.map((c) => ({
        value: `change:${key}/${c.id}`,
        label: c.id,
        detail: [c.description ?? "", label(key)].filter((s) => s !== "").join(" · "),
        href: to.change(key, c.id),
      })),
    ),
    ...input.changes.flatMap(({ key, list }) =>
      list.archived.map((a) => ({
        value: `archived:${key}/${a.dir}`,
        label: a.id,
        detail: `${label(key)} · archived ${a.date}`,
        href: to.archived(key, a.dir),
      })),
    ),
  ]
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
        href: to.project(p.key),
      })),
    },
  ]
  return groups.filter((g) => g.entries.length > 0)
}
