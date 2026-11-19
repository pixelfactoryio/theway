/** The sidebar's pinned and recent entries and the grouping suggestions. Pure: no React, no DOM. */
import type { ArchivedChange, ChangeList, DashboardSettings, Project } from "../../contract"
import { type ActiveRow, activeRows, changeCount, rowStatus, type Status } from "./changes"
import { monthGroup } from "./collapse"
import { fileMatches } from "./files"
import { type FieldRule, NONE, valueCounts } from "./list-filter"
import { byLabel } from "./projects"
import { to } from "./routes"

/** An entry of the sidebar or of All projects: a project, or a group of projects made by hand. */
export type Entry = {
  /** `project:<key>` or `group:<id>`. */
  id: string
  kind: "project" | "group"
  label: string
  /** The keys of its projects: the project's own, or the group's listed ones. */
  keys: string[]
  /** The number of active changes across its projects. */
  open: number
  /** The address of its page. */
  href: string
}

/** The entry `id` names, `null` when its project or group no longer exists. */
export function entryOf(id: string, projects: readonly Project[], settings: DashboardSettings): Entry | null {
  if (id.startsWith("project:")) {
    const key = id.slice("project:".length)
    const p = projects.find((x) => x.key === key)
    if (p === undefined) return null
    return { id, kind: "project", label: p.label, keys: [key], open: p.active, href: to.project(key) }
  }
  if (id.startsWith("group:")) {
    const gid = id.slice("group:".length)
    const g = settings.groups.find((x) => x.id === gid)
    if (g === undefined) return null
    const keys = g.projects.filter((k) => projects.some((p) => p.key === k))
    const open = keys.reduce((n, k) => n + (projects.find((p) => p.key === k)?.active ?? 0), 0)
    return { id, kind: "group", label: g.name, keys, open, href: to.group(gid) }
  }
  return null
}

/** The pinned entries in their order, those whose project or group is gone left out. */
export const pinnedEntries = (projects: readonly Project[], settings: DashboardSettings): Entry[] =>
  settings.pinned.flatMap((id) => entryOf(id, projects, settings) ?? [])

/** The recently opened entries that are not pinned, newest first, at most five. */
export const recentEntries = (projects: readonly Project[], settings: DashboardSettings): Entry[] =>
  settings.recent
    .filter((id) => !settings.pinned.includes(id))
    .flatMap((id) => entryOf(id, projects, settings) ?? [])
    .slice(0, 5)

/** Every entry for All projects: each group, then each project in no group, by label. */
export function allEntries(projects: readonly Project[], settings: DashboardSettings): Entry[] {
  const grouped = new Set(settings.groups.flatMap((g) => g.projects))
  const groups = settings.groups.flatMap((g) => entryOf(`group:${g.id}`, projects, settings) ?? [])
  const solo = byLabel(projects.filter((p) => !grouped.has(p.key))).flatMap(
    (p) => entryOf(`project:${p.key}`, projects, settings) ?? [],
  )
  return [...groups, ...solo]
}

/** A project label's first word: the text before its first `-`, `.` or `_`, lower-cased. */
const firstWord = (label: string): string => (label.toLowerCase().split(/[-._]/)[0] ?? "").trim()

/** A suggested group: its name, its projects' keys, and the key that dismisses it. */
export type Suggestion = { name: string; keys: string[]; key: string }

/**
 * Groups to suggest: the projects in no group whose labels share a first word of 3 letters or more, two or more of
 * them, minus the suggestions dismissed. Only a suggestion: nothing is grouped until it is accepted.
 */
export function suggestions(projects: readonly Project[], settings: DashboardSettings): Suggestion[] {
  const grouped = new Set(settings.groups.flatMap((g) => g.projects))
  const byWord = new Map<string, Project[]>()
  for (const p of byLabel(projects)) {
    if (grouped.has(p.key)) continue
    const word = firstWord(p.label)
    if (word.length < 3) continue
    byWord.set(word, [...(byWord.get(word) ?? []), p])
  }
  return [...byWord.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([word, list]) => {
      const keys = list.map((p) => p.key).sort()
      return { name: word, keys, key: keys.join("|") }
    })
    .filter((s) => !settings.dismissed.includes(s.key))
}

/** A new group's id from its name: lower-case words joined by `-`, made unique among `taken`. */
export function groupId(name: string, taken: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "group"
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** The settings with a new group `name` of `keys`, each taken out of any other group. */
export function withGroup(settings: DashboardSettings, name: string, keys: readonly string[]): DashboardSettings {
  const id = groupId(
    name,
    settings.groups.map((g) => g.id),
  )
  const groups = settings.groups
    .map((g) => ({ ...g, projects: g.projects.filter((k) => !keys.includes(k)) }))
    .filter((g) => g.projects.length > 0)
  return { ...settings, groups: [...groups, { id, name: name.trim(), projects: [...keys] }] }
}

/** The settings with project `key` added to group `id` (and out of any other group). */
export function withProjectIn(settings: DashboardSettings, id: string, key: string): DashboardSettings {
  return {
    ...settings,
    groups: settings.groups
      .map((g) =>
        g.id === id
          ? { ...g, projects: g.projects.includes(key) ? g.projects : [...g.projects, key] }
          : { ...g, projects: g.projects.filter((k) => k !== key) },
      )
      .filter((g) => g.projects.length > 0),
  }
}

/** The settings with project `key` out of every group; a group left empty is removed with its pin. */
export function withoutProject(settings: DashboardSettings, key: string): DashboardSettings {
  const groups = settings.groups.map((g) => ({ ...g, projects: g.projects.filter((k) => k !== key) }))
  const gone = groups.filter((g) => g.projects.length === 0).map((g) => `group:${g.id}`)
  return {
    ...settings,
    groups: groups.filter((g) => g.projects.length > 0),
    pinned: settings.pinned.filter((p) => !gone.includes(p)),
    recent: settings.recent.filter((p) => !gone.includes(p)),
  }
}

/** The settings without group `id`: its projects stand alone again; no change data is touched. */
export const ungrouped = (settings: DashboardSettings, id: string): DashboardSettings => ({
  ...settings,
  groups: settings.groups.filter((g) => g.id !== id),
  pinned: settings.pinned.filter((p) => p !== `group:${id}`),
  recent: settings.recent.filter((p) => p !== `group:${id}`),
})

/** The settings with group `id` renamed. */
export const renamed = (settings: DashboardSettings, id: string, name: string): DashboardSettings => ({
  ...settings,
  groups: settings.groups.map((g) => (g.id === id ? { ...g, name: name.trim() } : g)),
})

/** The settings with `id` pinned (at the end) or unpinned. */
export const togglePin = (settings: DashboardSettings, id: string): DashboardSettings => ({
  ...settings,
  pinned: settings.pinned.includes(id) ? settings.pinned.filter((p) => p !== id) : [...settings.pinned, id],
})

/** The number of changes still to do: in progress, not started or invalid; Ready to archive left out. */
export const toDo = (list: ChangeList | undefined): number =>
  list?.active.filter((c) => c.status !== "ready").length ?? 0

/** The rows Now lists under `status`: a change, or a series of that status as a whole counted once. */
const rowCount = (list: ChangeList | undefined, status: Status): number =>
  activeRows(list?.active ?? [], "").filter((r) => rowStatus(r) === status).length

/** The rows Now lists as In progress: a change, or a series In progress as a whole counted once. */
export const inProgressCount = (list: ChangeList | undefined): number => rowCount(list, "in-progress")

export { countOf } from "./list-filter"

/** The fields of All projects' filter bar: the project's group, and whether it is pinned. */
export const PROJECT_FIELDS = ["group", "pinned"] as const

/**
 * A project's values in All projects' filter fields: `group` its group's ID (`NONE` when in none); `pinned` `yes` when
 * it is pinned, itself or through its group, else `no`.
 */
export function projectValues(settings: DashboardSettings, key: string, field: string): string[] {
  const group = settings.groups.find((g) => g.projects.includes(key))
  if (field === "group") return [group?.id ?? NONE]
  if (field === "pinned") {
    const id = group !== undefined ? `group:${group.id}` : `project:${key}`
    return [settings.pinned.includes(id) ? "yes" : "no"]
  }
  return []
}

/** One row of a project's open changes, a change or a series, with the project's key and label. */
export type Located = { key: string; label: string; row: ActiveRow }

/** The open rows of `projects` (a series of two or more as one row) whose ID or description holds `q`, newest first. */
export function located(lists: Map<string, ChangeList>, projects: readonly Project[], q: string): Located[] {
  const updated = (r: ActiveRow) => (r.kind === "series" ? r.updated : r.change.updated)
  return projects
    .flatMap((p) => activeRows(lists.get(p.key)?.active ?? [], q).map((row) => ({ key: p.key, label: p.label, row })))
    .sort((a, b) => updated(b.row).localeCompare(updated(a.row)))
}

/** A located row's values in the lists' filter fields: its status and its project. */
export const locatedValues = (r: Located, field: string): string[] =>
  field === "status" ? [rowStatus(r.row)] : field === "project" ? [r.key] : []

/** The changes a row holds: a series row its listed members. */
export const changesOf = (r: Located): number => changeCount([r.row])

/** The month heading of an archive date `YYYY-MM-DD…`: "November 2026". */
export const monthOf = (date: string): string => {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00`)
  return Number.isNaN(d.getTime())
    ? date.slice(0, 7)
    : d.toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

/** An archived change with its project's key. */
export type Archived = { key: string; a: ArchivedChange }

/** A month of an archive list: its group ID, its heading, the rows listed, and how many the month holds. */
export type ArchiveMonth = { id: string; month: string; rows: Archived[]; total: number }

/**
 * The months of `shown` (newest first), each with its rows and the number of `all`'s rows of that month, which is more
 * than its rows when the list is cut. `shown` holds rows of `all`.
 */
export function archiveMonths(shown: readonly Archived[], all: readonly Archived[] = shown): ArchiveMonth[] {
  const totals = new Map<string, number>()
  for (const r of all) {
    const id = monthGroup(r.a.date)
    totals.set(id, (totals.get(id) ?? 0) + 1)
  }
  const months: ArchiveMonth[] = []
  for (const r of shown) {
    const id = monthGroup(r.a.date)
    const last = months.at(-1)
    if (last?.id === id) last.rows.push(r)
    else months.push({ id, month: monthOf(r.a.date), rows: [r], total: totals.get(id) ?? 0 })
  }
  return months
}

/** An archived change's values in the lists' filter fields. */
export const archivedValues = (r: Archived, field: string): string[] =>
  field === "status" ? ["archived"] : field === "project" ? [r.key] : []

/** The archived changes of `keys`' lists, newest first. */
export const archivesOf = (lists: Map<string, ChangeList>, keys: readonly string[]): Archived[] =>
  keys
    .flatMap((k) => (lists.get(k)?.archived ?? []).map((a) => ({ key: k, a })))
    .sort((x, y) => y.a.date.localeCompare(x.a.date) || y.a.updated.localeCompare(x.a.updated))

/** The archived changes of `rows` whose ID holds `q`, ignoring case. */
export const archivesMatching = (rows: readonly Archived[], q: string): Archived[] =>
  rows.filter(({ a }) => fileMatches({ name: a.id }, q))

/** The latest archive date among `archived` (newest first), `""` when none. */
const lastArchived = (archived: readonly ArchivedChange[] | undefined): string => archived?.[0]?.date ?? ""

/**
 * The counts of `field`'s values among the `located` rows the other fields' rules keep, plus the `archived` rows' when
 * `archive`.
 */
export function countsOf(
  field: string,
  rules: readonly FieldRule[],
  located: readonly Located[],
  archived: readonly Archived[],
  archive: boolean,
): Map<string, number> {
  const counts = valueCounts(located, field, rules, locatedValues)
  if (archive)
    for (const [v, n] of valueCounts(archived, field, rules, archivedValues)) counts.set(v, (counts.get(v) ?? 0) + n)
  return counts
}

/** The latest archive date among the projects `keys`, `""` when none. */
export const latest = (lists: Map<string, ChangeList>, keys: readonly string[]): string =>
  keys.map((k) => lastArchived(lists.get(k)?.archived)).reduce((a, b) => (a > b ? a : b), "")

/** The rows In progress across the projects `keys`, as Now counts them: a series In progress as a whole once. */
export const inProgress = (lists: Map<string, ChangeList>, keys: readonly string[]): number =>
  keys.reduce((n, k) => n + inProgressCount(lists.get(k)), 0)

/** The rows Not started across the projects `keys`, as Now counts them: a series Not started as a whole once. */
export const notStarted = (lists: Map<string, ChangeList>, keys: readonly string[]): number =>
  keys.reduce((n, k) => n + rowCount(lists.get(k), "not-started"), 0)

/** A row of a change grid: a located change or series, or a series' member; a series has its members as `subRows`. */
export type TreeRow = Located & { subRows: TreeRow[] }

/** The grid rows of `located`: a series with its members as sub-rows (each with the series' project), a change none. */
export const treeRows = (located: readonly Located[]): TreeRow[] =>
  located.map((r) => ({
    ...r,
    subRows:
      r.row.kind === "series" ? r.row.children.map((c) => ({ key: r.key, label: r.label, row: c, subRows: [] })) : [],
  }))

/** A row of All projects: a project (`key`), or a group (`key` `null`) with its listed projects as `subRows`. */
export type ProjectRow = {
  /** The entry's ID, or `<group's ID>/<project's key>` for a group's project. */
  id: string
  entry: Entry
  key: string | null
  /** The projects it counts: its own key, or the group's listed ones. */
  keys: string[]
  subRows: ProjectRow[]
}

/** The rows of All projects: each entry with the projects it lists (`keys`), a group's as its sub-rows. */
export const projectTree = (entries: readonly { e: Entry; keys: readonly string[] }[]): ProjectRow[] =>
  entries.map(({ e, keys }) =>
    e.kind === "group"
      ? {
          id: e.id,
          entry: e,
          key: null,
          keys: [...keys],
          subRows: keys.map((k) => ({ id: `${e.id}/${k}`, entry: e, key: k, keys: [k], subRows: [] })),
        }
      : { id: e.id, entry: e, key: e.keys[0] as string, keys: [...keys], subRows: [] },
  )
