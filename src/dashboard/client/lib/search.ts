/** The entries of the ⌘K search, grouped as the dialog lists them. Pure: no React, no DOM. */

import type { ChangeList, Status } from "./changes"
import { appliesTo, type PromptRow, type WorkflowRow } from "./files"
import { byLabel, type Project } from "./projects"
import { to } from "./routes"

/**
 * One entry, read as a list row: its cmdk `value` (unique), what it is (`kind`, and a change's `status` for its icon),
 * its `name` first (a description, a project's name; the ID or file name itself when there is none, then `mono`), the
 * `id` after it in mono (`null` when the name is the ID), the `detail` at the row's right, and the page it opens.
 */
export type SearchEntry = {
  value: string
  kind: "change" | "workflow" | "prompt" | "project"
  status?: Status
  name: string
  mono: boolean
  id: string | null
  detail: string
  href: string
}

/** A name and its ID: the description first and the ID after it, or the ID alone in the name's place. */
const named = (description: string | null | undefined, id: string): Pick<SearchEntry, "name" | "mono" | "id"> =>
  description !== null && description !== undefined && description !== ""
    ? { name: description, mono: false, id }
    : { name: id, mono: true, id: null }

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

/** A workflow's or prompt's entry: its description then its name, where it applies, its page. */
function fileEntry(
  kind: "workflows" | "prompts",
  row: { name: string; project: string | null; description: string | null },
  label: (key: string) => string,
): SearchEntry {
  const one = kind === "workflows" ? "workflow" : "prompt"
  return {
    value: `${one}:${row.project ?? "global"}/${row.name}`,
    kind: one,
    ...named(row.description, row.name),
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
      list.active.map((c): SearchEntry => ({
        value: `change:${key}/${c.id}`,
        kind: "change",
        status: c.status,
        ...named(c.description, c.id),
        detail: label(key),
        href: to.change(key, c.id),
      })),
    ),
    ...input.changes.flatMap(({ key, list }) =>
      list.archived.map((a): SearchEntry => ({
        value: `archived:${key}/${a.dir}`,
        kind: "change",
        status: "archived",
        ...named(null, a.id),
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
      entries: byLabel(input.projects ?? []).map((p): SearchEntry => ({
        value: `project:${p.key}`,
        kind: "project",
        name: p.label,
        mono: false,
        id: p.path,
        detail: `${p.active} active`,
        href: to.project(p.key),
      })),
    },
  ]
  return groups.filter((g) => g.entries.length > 0)
}
