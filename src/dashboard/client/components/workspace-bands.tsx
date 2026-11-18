import { CircleDotIcon, FolderIcon } from "lucide-react"
import { Link } from "wouter"

import type { BarField } from "@/components/filter-bar"
import { StatusMark } from "@/components/status"
import { GROUP_TITLE, type Group, NoProgress, ROW, RowCells, RowList } from "@/components/workspace-rows"
import { rowStatus, type Status } from "@/lib/changes"
import { monthGroup } from "@/lib/collapse"
import { type Project } from "@/lib/projects"
import { to } from "@/lib/routes"
import { type Archived, changesOf, type Located, monthOf } from "@/lib/workspace"

/**
 * The status groups of `rows`: Needs fixing, In progress, Not started, then Ready to archive (as rows, or with
 * `readyByProject` as one count per project, which opens that project's page). Each band counts its rows, a series
 * once; Ready to archive by project counts its changes. Ready to archive starts collapsed.
 */
export function statusGroups(
  rows: readonly Located[],
  { showProject, readyByProject, now }: { showProject: boolean; readyByProject: boolean; now: number },
): Group[] {
  const groups: Group[] = []
  for (const status of ["invalid", "in-progress", "not-started"] as const) {
    const kept = rows.filter((r) => rowStatus(r.row) === status)
    if (kept.length === 0) continue
    groups.push({
      id: status,
      label: GROUP_TITLE[status],
      mark: <StatusMark status={status} />,
      count: kept.length,
      body: <RowList rows={kept} showProject={showProject} now={now} />,
    })
  }
  const ready = rows.filter((r) => rowStatus(r.row) === "ready")
  if (ready.length === 0) return groups
  const perProject = [...new Set(ready.map((r) => r.key))].map((key) => {
    const own = ready.filter((r) => r.key === key)
    return { key, label: own[0]?.label ?? key, n: own.reduce((n, r) => n + changesOf(r), 0) }
  })
  groups.push({
    id: "ready",
    label: GROUP_TITLE.ready,
    mark: <StatusMark status="ready" />,
    count: readyByProject ? perProject.reduce((n, p) => n + p.n, 0) : ready.length,
    collapsed: true,
    body: readyByProject ? (
      <div className="flex flex-wrap gap-2 px-6 py-3">
        {perProject.map((p) => (
          <Link
            key={p.key}
            href={to.project(p.key)}
            className="rounded-md border px-3 py-1 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            {p.label}
            <span className="ml-2 font-medium text-success tabular-nums">{p.n}</span>
          </Link>
        ))}
      </div>
    ) : (
      <RowList rows={ready} showProject={showProject} now={now} />
    ),
  })
  return groups
}

/**
 * The archive months of `rows` (newest first), each a group of its rows; the first open, the older ones collapsed.
 * Each row lines up with the open changes' rows: its ID, its project (`withProject`) and its archive date (`MM-DD`)
 * in the age column.
 */
export function archiveGroups(rows: readonly Archived[], withProject: boolean, label: (k: string) => string): Group[] {
  const months: { id: string; month: string; rows: Archived[] }[] = []
  for (const r of rows) {
    const id = monthGroup(r.a.date)
    const last = months.at(-1)
    if (last?.id === id) last.rows.push(r)
    else months.push({ id, month: monthOf(r.a.date), rows: [r] })
  }
  return months.map((m, i) => ({
    id: m.id,
    label: m.month,
    mark: <StatusMark status="archived" />,
    count: m.rows.length,
    collapsed: i > 0,
    body: (
      <ul data-nav-list="">
        {m.rows.map(({ key, a }) => (
          <li key={`${key}/${a.dir}`} data-nav-item="">
            <Link href={to.archived(key, a.dir)} className={ROW}>
              <RowCells
                id={a.id}
                project={withProject ? label(key) : undefined}
                progress={<NoProgress />}
                age={a.date}
              />
            </Link>
          </li>
        ))}
      </ul>
    ),
  }))
}

/** The Status field's values: the open changes' statuses, then Archived. */
export const STATUS_VALUES = ["invalid", "in-progress", "not-started", "ready", "archived"] as const

/** The Status field of a list: one value per status the page lists, each with its mark. */
export const statusField = (statuses: readonly Status[], counts: ReadonlyMap<string, number>): BarField => ({
  id: "status",
  label: "Status",
  icon: <CircleDotIcon aria-hidden="true" />,
  options: statuses.map((s) => ({ value: s, label: GROUP_TITLE[s], icon: <StatusMark status={s} /> })),
  counts,
})

/** The Project field of a list over several projects. */
export const projectField = (projects: readonly Project[], counts: ReadonlyMap<string, number>): BarField => ({
  id: "project",
  label: "Project",
  icon: <FolderIcon aria-hidden="true" />,
  options: [...projects].sort((a, b) => a.label.localeCompare(b.label)).map((p) => ({ value: p.key, label: p.label })),
  counts,
})
