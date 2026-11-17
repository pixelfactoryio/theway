/** The sidebar's pinned and recent entries and the grouping suggestions. Pure: no React, no DOM. */
import type { ChangeList, DashboardSettings, Project } from "../../contract"
import { activeRows, rowStatus } from "./changes"
import { byLabel } from "./projects"

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
    return { id, kind: "project", label: p.label, keys: [key], open: p.active, href: `/${key}?` }
  }
  if (id.startsWith("group:")) {
    const gid = id.slice("group:".length)
    const g = settings.groups.find((x) => x.id === gid)
    if (g === undefined) return null
    const keys = g.projects.filter((k) => projects.some((p) => p.key === k))
    const open = keys.reduce((n, k) => n + (projects.find((p) => p.key === k)?.active ?? 0), 0)
    return { id, kind: "group", label: g.name, keys, open, href: `/group/${encodeURIComponent(gid)}?` }
  }
  return null
}

/** The pinned entries in their order, those whose project or group is gone left out. */
export const pinnedEntries = (projects: readonly Project[], settings: DashboardSettings): Entry[] =>
  settings.pinned.flatMap((id) => entryOf(id, projects, settings) ?? [])

/** The recently opened entries that are not pinned, newest first, at most `max`. */
export const recentEntries = (projects: readonly Project[], settings: DashboardSettings, max = 5): Entry[] =>
  settings.recent
    .filter((id) => !settings.pinned.includes(id))
    .flatMap((id) => entryOf(id, projects, settings) ?? [])
    .slice(0, max)

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

/** The settings with a new group `name` of `keys`, each taken out of any other group, pinned when `pin`. */
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

/** The rows Now lists as In progress: a change, or a series In progress as a whole counted once. */
export const inProgressCount = (list: ChangeList | undefined): number =>
  activeRows(list?.active ?? [], "", []).filter((r) => rowStatus(r) === "in-progress").length

/** `n` and `noun`, plural unless `n` is 1: `1 project`, `3 projects`. */
export const countOf = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`
