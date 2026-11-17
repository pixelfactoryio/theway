/** The changes of a project as the Changes page and the change page show them. Pure: no React, no DOM. */
import type { ActiveChange, Status } from "../../contract"
import { MEMBER } from "../../../core/change-text"
import { byText } from "../../../core/text"
import { localTime } from "./edit"
import { fileMatches } from "./files"

export type { ActiveChange, ArchivedChange, ChangeDetail, ChangeList, SeriesMember, Status } from "../../contract"
export { ChangeDetailSchema, ChangeListSchema } from "../../contract"

/** The statuses of an active change, in the order the page sorts and filters them. */
export const ACTIVE_STATUSES = ["invalid", "in-progress", "not-started", "ready"] as const
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number]

export const STATUS_LABEL: Record<Status, string> = {
  invalid: "Invalid",
  "in-progress": "In progress",
  "not-started": "Not started",
  ready: "Ready to archive",
  archived: "Archived",
}

/** The series ID and ordinal of a change ID ending in `-NN`, `null` otherwise. */
export function memberOf(id: string): { series: string; ordinal: string } | null {
  const m = MEMBER.exec(id)
  return m === null ? null : { series: m[1] as string, ordinal: m[2] as string }
}

/** A row of the Active grid: one change, or a series of two or more active changes with its members. */
type ChangeRow = {
  kind: "change"
  id: string
  change: ActiveChange
}
export type SeriesRow = {
  kind: "series"
  id: string
  status: ActiveStatus
  /** The summed counts of its valid members, `null` when none is valid. */
  progress: { done: number; total: number } | null
  updated: string
  /** The number of its active members, whatever the search and the filter keep. */
  count: number
  children: ChangeRow[]
}
export type ActiveRow = ChangeRow | SeriesRow

/** A series' status: Invalid when a member is, Ready or Not started when all are, else In progress. */
export function seriesStatus(members: readonly ActiveChange[]): ActiveStatus {
  if (members.some((m) => m.status === "invalid")) return "invalid"
  if (members.every((m) => m.status === "ready")) return "ready"
  if (members.every((m) => m.status === "not-started")) return "not-started"
  return "in-progress"
}

/** The counts summed over the valid members, `null` when none is valid. */
export function seriesProgress(members: readonly ActiveChange[]): { done: number; total: number } | null {
  const valid = members.filter((m) => m.status !== "invalid")
  if (valid.length === 0) return null
  return { done: valid.reduce((n, m) => n + m.done, 0), total: valid.reduce((n, m) => n + m.total, 0) }
}

/** Whether a change's ID or description holds `q`, ignoring case; every change when `q` is empty. */
const matches = (change: { id: string; description?: string | null }, q: string): boolean =>
  fileMatches({ name: change.id, description: change.description }, q)

/**
 * The rows of the Active grid: the changes the search and the status filter keep, two or more active changes of one
 * series grouped under a series row (members in ordinal order, listing only those kept; its status, progress, Updated
 * and count over all its active members). In the default order: status, then ID.
 */
export function activeRows(active: readonly ActiveChange[], q: string, statuses: readonly ActiveStatus[]): ActiveRow[] {
  const groups = new Map<string, ActiveChange[]>()
  for (const c of active) {
    const m = memberOf(c.id)
    if (m !== null) groups.set(m.series, [...(groups.get(m.series) ?? []), c])
  }
  const kept = (c: ActiveChange): boolean => matches(c, q) && (statuses.length === 0 || statuses.includes(c.status))
  const rows: ActiveRow[] = []
  const seen = new Set<string>()
  for (const c of active) {
    const series = memberOf(c.id)?.series
    const members = series === undefined ? undefined : groups.get(series)
    if (series === undefined || members === undefined || members.length < 2) {
      if (kept(c)) rows.push({ kind: "change", id: c.id, change: c })
      continue
    }
    if (seen.has(series)) continue
    seen.add(series)
    const children = members
      .filter(kept)
      .sort((a, b) => byText(memberOf(a.id)?.ordinal ?? "", memberOf(b.id)?.ordinal ?? "") || byText(a.id, b.id))
      .map((m): ChangeRow => ({ kind: "change", id: m.id, change: m }))
    if (children.length === 0) continue
    rows.push({
      kind: "series",
      id: series,
      status: seriesStatus(members),
      progress: seriesProgress(members),
      updated: members.reduce((u, m) => (m.updated > u ? m.updated : u), ""),
      count: members.length,
      children,
    })
  }
  const rank = (r: ActiveRow): number => ACTIVE_STATUSES.indexOf(rowStatus(r))
  return rows.sort((a, b) => rank(a) - rank(b) || byText(a.id, b.id))
}

/** A row's status. */
export const rowStatus = (row: ActiveRow): ActiveStatus => (row.kind === "series" ? row.status : row.change.status)

/** The number of changes `rows` hold: a series row counts its listed members. */
export const changeCount = (rows: readonly ActiveRow[]): number =>
  rows.reduce((n, r) => n + (r.kind === "series" ? r.children.length : 1), 0)

/**
 * How long ago `iso` was, from `now` (both ISO times or epoch milliseconds), in the largest whole unit: `now` under a
 * minute, then `5m`, `3h`, `2d`, `6w`, `4mo`, `2y`.
 */
export function ageOf(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000))
  if (Number.isNaN(s) || s < 60) return "now"
  const units: [number, string][] = [
    [365 * 86400, "y"],
    [30 * 86400, "mo"],
    [7 * 86400, "w"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ]
  const [size, unit] = units.find(([size]) => s >= size) as [number, string]
  return `${Math.floor(s / size)}${unit}`
}

/** The browser's local date of an ISO time, `YYYY-MM-DD`. */
export const localDate = (iso: string): string => localTime(iso).slice(0, 10)

/** One tab of the change page: a Markdown file or the Tasks. */
export type ChangeTab = { slug: string; label: string; file: string | null }

/** A Markdown file's tab: its name without `.md` (`tasks-md` for `tasks.md`), labelled with a capital first letter. */
function fileTab(name: string): ChangeTab {
  const base = name.replace(/\.md$/, "")
  return {
    slug: name === "tasks.md" ? "tasks-md" : base,
    label: base.charAt(0).toUpperCase() + base.slice(1),
    file: name,
  }
}

/** The tabs of a change: one per Markdown file in the route's order, then Tasks. */
export const changeTabs = (files: readonly { name: string }[]): ChangeTab[] => [
  ...files.map((f) => fileTab(f.name)),
  { slug: "tasks", label: "Tasks", file: null },
]

/** The tab shown for the address' `slug`: that tab when the change has it, else the first. */
export function shownTab(tabs: readonly ChangeTab[], slug: string | undefined): ChangeTab {
  return tabs.find((t) => t.slug === slug) ?? (tabs[0] as ChangeTab)
}

/** A task's text cut into plain and code parts at its backtick spans; the backticks are dropped. */
export function inlineCode(text: string): { code: boolean; text: string }[] {
  const parts: { code: boolean; text: string }[] = []
  const re = /`([^`\n]+)`/g
  let at = 0
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0
    if (start > at) parts.push({ code: false, text: text.slice(at, start) })
    parts.push({ code: true, text: m[1] as string })
    at = start + m[0].length
  }
  if (at < text.length) parts.push({ code: false, text: text.slice(at) })
  return parts
}

/** Whether a Markdown link target is shown as a link: `http:`, `https:` and `mailto:` only. */
export function isLinkTarget(href: string | undefined | null): boolean {
  return typeof href === "string" && /^(?:https?:|mailto:)/i.test(href.trim())
}

/** The tag a Markdown heading of source level `depth` renders as: one level down, at most `h6`. */
export const headingTag = (depth: number): string => `h${Math.min(depth + 1, 6)}`
