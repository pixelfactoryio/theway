import { CircleDotIcon, FolderIcon } from "lucide-react"
import { type ReactNode, useState } from "react"

import { ChangeProgress } from "@/components/change-progress"
import type { BarField } from "@/components/filter-bar"
import { COLUMN, IdName, type ListColumn, ListRow, ListRows, ProjectChip, RowChip, RowId } from "@/components/list-kit"
import { StatusMark } from "@/components/status"
import { GROUP_TITLE, type Group, useNow } from "@/components/workspace-rows"
import { useLabel } from "@/data/queries"
import { ageOf, ownDescription, rowStatus, type ActiveChange, type Status } from "@/lib/changes"
import { type Project } from "@/lib/projects"
import { to } from "@/lib/routes"
import { type Archived, archiveMonths, changesOf, countOf, type Located } from "@/lib/workspace"

/** A row of a change list: an open change or series, or an archived change. */
export type ChangeListRow = Located | Archived

const isArchived = (r: ChangeListRow): r is Archived => "a" in r

/**
 * The columns of a page's change lists: the project (`project`: a list over several projects), the progress
 * (`progress`: the page lists an open change as a row; archived changes have none) and the date: Updated, an open
 * change's age or an archived change's archive date, wide enough for a date when the page lists archived changes
 * (`dates`); Archived when the list holds archived changes alone (`archivedOnly`).
 */
export function changeColumns({
  project,
  progress,
  dates,
  archivedOnly = false,
}: {
  project: boolean
  progress: boolean
  dates: boolean
  archivedOnly?: boolean
}): ListColumn[] {
  return [
    ...(project ? [{ id: "project", title: "Project", className: COLUMN.project }] : []),
    ...(progress ? [{ id: "progress", title: "Progress", className: COLUMN.progress, align: "end" as const }] : []),
    {
      id: "updated",
      title: archivedOnly ? "Archived" : "Updated",
      className: dates ? COLUMN.date : COLUMN.updated,
      align: "end",
    },
  ]
}

/** The cells of a row, in `columns`' order, from each column's content. */
const cellsOf = (columns: readonly ListColumn[], content: Record<string, ReactNode>) =>
  columns.map((column) => ({ column, content: content[column.id] ?? null }))

/**
 * An open change's row: its description first, then its ID; its ID alone in the description's place when it has none
 * or the description only repeats the ID.
 */
function ChangeRow({
  r,
  change,
  columns,
  member,
  now,
}: {
  r: Located
  change: ActiveChange
  columns: readonly ListColumn[]
  member: boolean
  now: number
}) {
  const description = ownDescription(change.description, change.id)
  return (
    <ListRow
      head={{ href: to.change(r.key, change.id) }}
      icon={<StatusMark status={change.status} />}
      meta={description !== null ? <RowId>{change.id}</RowId> : undefined}
      title={description ?? undefined}
      member={member}
      cells={cellsOf(columns, {
        project: <ProjectChip label={r.label} />,
        progress: <ChangeProgress done={change.done} total={change.total} status={change.status} />,
        updated: ageOf(change.updated, now),
      })}
    >
      {description ?? <IdName>{change.id}</IdName>}
    </ListRow>
  )
}

/**
 * The rows of one section of a change list, named `label`: open changes, series (its first member's description, then
 * its ID and its chip; a row that opens its members beneath it, indented, each like any other row) and archived
 * changes (their ID: the archive has no description), under `columns`.
 */
export function ChangeRows({
  rows,
  label,
  columns,
}: {
  rows: readonly ChangeListRow[]
  label: string
  columns: readonly ListColumn[]
}) {
  const now = useNow()
  const projectLabel = useLabel()
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <ListRows label={label} nav={false}>
      {rows.map((r) => {
        if (isArchived(r))
          return (
            <ListRow
              key={`${r.key}/${r.a.dir}`}
              head={{ href: to.archived(r.key, r.a.dir) }}
              icon={<StatusMark status="archived" />}
              cells={cellsOf(columns, { project: <ProjectChip label={projectLabel(r.key)} />, updated: r.a.date })}
            >
              <IdName>{r.a.id}</IdName>
            </ListRow>
          )
        const item = r.row
        if (item.kind === "change")
          return (
            <ChangeRow
              key={`${r.key}/${item.id}`}
              r={r}
              change={item.change}
              columns={columns}
              member={false}
              now={now}
            />
          )
        const id = `${r.key}/${item.id}`
        const expanded = open.has(id)
        const description = ownDescription(item.description, item.id)
        return [
          <ListRow
            key={id}
            head={{ onToggle: () => toggle(id), expanded }}
            icon={<StatusMark status={item.status} />}
            meta={
              <>
                {description !== null ? <RowId>{item.id}</RowId> : null}
                <RowChip wide>series · {item.count}</RowChip>
              </>
            }
            title={description ?? undefined}
            cells={cellsOf(columns, {
              project: <ProjectChip label={r.label} />,
              progress:
                item.progress !== null ? (
                  <ChangeProgress done={item.progress.done} total={item.progress.total} status={item.status} />
                ) : null,
              updated: ageOf(item.updated, now),
            })}
          >
            {description ?? <IdName>{item.id}</IdName>}
          </ListRow>,
          ...(expanded
            ? item.children.map((c) => (
                <ChangeRow key={`${r.key}/${c.id}`} r={r} change={c.change} columns={columns} member now={now} />
              ))
            : []),
        ]
      })}
    </ListRows>
  )
}

/**
 * The status sections of `rows`: Invalid, In progress, Not started, then Ready to archive (as rows, or with
 * `readyByProject` as one row per project with its count, which opens that project's page). Each band counts its rows,
 * a series once; Ready to archive by project counts its changes. Ready to archive starts collapsed.
 */
export function statusGroups(
  rows: readonly Located[],
  {
    readyByProject,
    columns,
  }: {
    readyByProject: boolean
    columns: readonly ListColumn[]
  },
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
      body: <ChangeRows rows={kept} label={GROUP_TITLE[status]} columns={columns} />,
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
      <ListRows label={GROUP_TITLE.ready} nav={false}>
        {perProject.map((p) => (
          <ListRow
            key={p.key}
            head={{ href: to.project(p.key) }}
            icon={<StatusMark status="ready" />}
            meta={<span className="shrink-0 text-muted-foreground tabular-nums">{countOf(p.n, "change")}</span>}
            cells={cellsOf(columns, {})}
          >
            {p.label}
          </ListRow>
        ))}
      </ListRows>
    ) : (
      <ChangeRows rows={ready} label={GROUP_TITLE.ready} columns={columns} />
    ),
  })
  return groups
}

/**
 * The archive months of `rows` (newest first), each a section of its rows; the first open, the older ones collapsed.
 * A band counts its month among `all`, the list `rows` is cut from: `12 of 98` when it lists fewer.
 */
export function archiveGroups(
  rows: readonly Archived[],
  columns: readonly ListColumn[],
  all: readonly Archived[] = rows,
): Group[] {
  return archiveMonths(rows, all).map((m, i) => ({
    id: m.id,
    label: m.month,
    mark: <StatusMark status="archived" />,
    count: m.rows.length < m.total ? `${m.rows.length} of ${m.total}` : m.total,
    collapsed: i > 0,
    body: <ChangeRows rows={m.rows} label={m.month} columns={columns} />,
  }))
}

/** The Status field's values: the open changes' statuses, then Archived. */
export const STATUS_VALUES = ["invalid", "in-progress", "not-started", "ready", "archived"] as const

/** The Status field of a list: one value per status the page lists, each with its icon. */
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
