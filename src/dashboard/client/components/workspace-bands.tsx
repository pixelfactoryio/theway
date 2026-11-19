import type { ColumnDef, ColumnSizingState, OnChangeFn } from "@tanstack/react-table"
import { CircleDotIcon, FolderIcon } from "lucide-react"
import { type ReactNode, useMemo } from "react"
import { Link, useLocation } from "wouter"

import type { BandGridProps } from "@/components/band-grid"
import { ChangeProgress } from "@/components/change-progress"
import type { BarField } from "@/components/filter-bar"
import { ColumnLabel, HEADER_LAST_END, spareColumn } from "@/components/list-grid"
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { StatusMark } from "@/components/status"
import { GROUP_TITLE, type Group, HeadLink, HeadToggle, NoProgress, RowHead, useNow } from "@/components/workspace-rows"
import { useLabel } from "@/data/queries"
import { useBelowSm } from "@/hooks/use-below-sm"
import { useIsMobile } from "@/hooks/use-mobile"
import { ageOf, rowStatus, type Status } from "@/lib/changes"
import { type Project } from "@/lib/projects"
import { to } from "@/lib/routes"
import { type Archived, archiveMonths, changesOf, type Located, type TreeRow } from "@/lib/workspace"
import { useWide } from "@/shell/panel"

/** A row of a change grid: an open change, a series or a series' member, or an archived change. */
export type ChangeGridRow = TreeRow | Archived

const isArchived = (r: ChangeGridRow): r is Archived => "a" in r

const changeRowId = (r: ChangeGridRow): string => (isArchived(r) ? `${r.key}/${r.a.dir}` : `${r.key}/${r.row.id}`)

const subRowsOf = (r: ChangeGridRow): ChangeGridRow[] | undefined => (isArchived(r) ? undefined : r.subRows)

/** A row's 96px progress bar hides below `sm`; its `done/total` stays, right-aligned in a 56px column. */
const TRACK = "hidden sm:flex"
const LABEL = "w-14 shrink-0 text-right"

/**
 * The change and progress columns' widths: the progress holds its 12px left padding and `ChangeProgress` whole (96px
 * bar, 8px gap, 56px count) from `sm` up, its count alone below; the change column's minimum lets a band fit a 390px
 * screen there.
 */
const WIDTHS = { wide: { change: 240, progress: 172 }, narrow: { change: 160, progress: 84 } } as const

/** The project column's width: 200px where the panel docks (1280px), 140px below. */
const PROJECT = { wide: 200, narrow: 140 } as const

/**
 * The change columns: the head (`RowHead`), the project (`project`), the progress and the age, an archived change's
 * archive date. The head links to the change, or opens a series; a member hangs on its series' guide line. `spare` is
 * the room past the list's cap, left empty at the right.
 */
function changeColumns({
  project,
  narrow,
  wide,
  spare,
  now,
  label,
}: {
  project: boolean
  narrow: boolean
  wide: boolean
  spare: number
  now: number
  label: (key: string) => string
}): ColumnDef<DataGridFeatures, ChangeGridRow>[] {
  const width = narrow ? WIDTHS.narrow : WIDTHS.wide
  return [
    {
      id: "change",
      header: () => <ColumnLabel>Change</ColumnLabel>,
      cell: ({ row }) => {
        const r = row.original
        if (isArchived(r))
          return (
            <HeadLink href={to.archived(r.key, r.a.dir)}>
              <RowHead id={r.a.id} />
            </HeadLink>
          )
        const item = r.row
        if (item.kind === "series")
          return (
            <HeadToggle
              open={row.getIsExpanded()}
              onToggle={() => row.toggleExpanded()}
              head={(lead) => <RowHead lead={lead} id={item.id} text={`series of ${item.count}`} />}
            />
          )
        const member = row.depth === 1
        return (
          <HeadLink href={to.change(r.key, item.id)} member={member}>
            <RowHead id={item.id} text={item.change.description ?? undefined} member={member} />
          </HeadLink>
        )
      },
      size: width.change,
      minSize: width.change,
      enableSorting: false,
      meta: { fillWidth: true, cellClassName: "relative" },
    },
    ...(project
      ? [
          {
            id: "project",
            header: () => <ColumnLabel>Project</ColumnLabel>,
            cell: ({ row }) => (isArchived(row.original) ? label(row.original.key) : row.original.label),
            size: wide ? PROJECT.wide : PROJECT.narrow,
            enableSorting: false,
            meta: { cellClassName: "text-muted-foreground" },
          } satisfies ColumnDef<DataGridFeatures, ChangeGridRow>,
        ]
      : []),
    {
      id: "progress",
      header: () => <ColumnLabel>Progress</ColumnLabel>,
      cell: ({ row }) => {
        const r = row.original
        if (isArchived(r)) return <NoProgress />
        const item = r.row
        if (item.kind === "change")
          return (
            <ChangeProgress
              done={item.change.done}
              total={item.change.total}
              status={item.change.status}
              trackClassName={TRACK}
              labelClassName={LABEL}
            />
          )
        return item.progress !== null ? (
          <ChangeProgress
            done={item.progress.done}
            total={item.progress.total}
            status={item.status}
            trackClassName={TRACK}
            labelClassName={LABEL}
          />
        ) : (
          <NoProgress />
        )
      },
      size: width.progress,
      enableSorting: false,
      // 12px at the left, so the title and the bars stand off the column's rule, and none at the right: the column is
      // exactly that much wider than `ChangeProgress`.
      meta: { headerClassName: "ps-3 pe-0", cellClassName: "ps-3 pe-0" },
    },
    {
      id: "age",
      header: () => <ColumnLabel>Updated</ColumnLabel>,
      cell: ({ row }) => {
        const r = row.original
        if (isArchived(r)) return r.a.date
        return ageOf(r.row.kind === "series" ? r.row.updated : r.row.change.updated, now)
      },
      size: 96,
      enableSorting: false,
      // Right-aligned against the 24px right gutter, with no left padding, so an archive date fits whole.
      meta: {
        headerClassName: `ps-0 ${HEADER_LAST_END}`,
        cellClassName: "ps-0 pe-6 text-right text-xs text-muted-foreground tabular-nums",
      },
    },
    ...spareColumn<ChangeGridRow>(spare),
  ]
}

/**
 * The change grids of a page, all sized by the page's `columnSizing`, with the project column when `project` (hidden
 * below 768px) and `spare` pixels left empty past the list's cap: `head`, the page's one header row, and `band`, a
 * band's rows from its rows and its name. A click in a row outside its head opens the change, or opens or closes a
 * series.
 */
export function useChangeGrid(
  columnSizing: ColumnSizingState,
  onColumnSizingChange: OnChangeFn<ColumnSizingState>,
  { project, spare }: { project: boolean; spare: number },
): {
  head: BandGridProps<ChangeGridRow>
  band: (rows: readonly ChangeGridRow[], label: string) => BandGridProps<ChangeGridRow>
} {
  const now = useNow()
  const label = useLabel()
  const mobile = useIsMobile()
  const narrow = useBelowSm()
  const wide = useWide()
  const [, navigate] = useLocation()
  const columns = useMemo(
    () => changeColumns({ project, narrow, wide, spare, now, label }),
    [project, narrow, wide, spare, now, label],
  )
  const grid = (rows: readonly ChangeGridRow[], name: string): BandGridProps<ChangeGridRow> => ({
    rows,
    columns,
    getRowId: changeRowId,
    getSubRows: subRowsOf,
    columnSizing,
    onColumnSizingChange,
    columnVisibility: project ? { project: !mobile } : undefined,
    onRowClick: (row) => {
      const r = row.original
      if (isArchived(r)) navigate(to.archived(r.key, r.a.dir))
      else if (r.row.kind === "series") row.toggleExpanded()
      else navigate(to.change(r.key, r.row.id))
    },
    label: name,
  })
  return {
    head: { ...grid([], "Columns"), part: "head" },
    band: (rows, name) => ({ ...grid(rows, name), part: "rows" }),
  }
}

/**
 * The status groups of `rows`: Invalid, In progress, Not started, then Ready to archive (as rows, or with
 * `readyByProject` as one count per project, which opens that project's page). Each band counts its rows, a series
 * once; Ready to archive by project counts its changes. Ready to archive starts collapsed.
 */
export function statusGroups(
  rows: readonly Located[],
  { readyByProject, body }: { readyByProject: boolean; body: (rows: readonly Located[], label: string) => ReactNode },
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
      body: body(kept, GROUP_TITLE[status]),
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
      body(ready, GROUP_TITLE.ready)
    ),
  })
  return groups
}

/**
 * The archive months of `rows` (newest first), each a group of its rows in `body`'s grid; the first open, the older
 * ones collapsed. A band counts its month among `all`, the list `rows` is cut from: `12 of 98` when it lists fewer.
 */
export function archiveGroups(
  rows: readonly Archived[],
  body: (rows: readonly Archived[], label: string) => ReactNode,
  all: readonly Archived[] = rows,
): Group[] {
  return archiveMonths(rows, all).map((m, i) => ({
    id: m.id,
    label: m.month,
    mark: <StatusMark status="archived" />,
    count: m.rows.length < m.total ? `${m.rows.length} of ${m.total}` : m.total,
    collapsed: i > 0,
    body: body(m.rows, m.month),
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
