import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef, ExpandedState, PaginationState, SortingState, Updater } from "@tanstack/react-table"
import { useTable } from "@tanstack/react-table"
import { FunnelIcon, SearchIcon, XIcon } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useLocation, useSearch } from "wouter"

import { Badge } from "@/components/reui/badge"
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable, DataGridTableRowExpand } from "@/components/reui/data-grid/data-grid-table"
import { StatusBadge } from "@/components/status"
import { OneLine } from "@/components/text"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ACTIVE_STATUSES,
  activeRows,
  archivedRows,
  changeCount,
  type ActiveRow,
  type ActiveStatus,
  type ArchivedChange,
  type ChangeList,
  type ChangesQuery,
  countText,
  localDate,
  PAGE_SIZES,
  parseQuery,
  queryString,
  rowStatus,
  shownPage,
  type SortColumn,
  sortRows,
  STATUS_LABEL,
  statusCounts,
  switchView,
} from "@/lib/changes"
import { getJson } from "@/shell/projects"
import { LoadError } from "@/shell/load-error"
import { PageBody, TopBar } from "@/shell/top-bar"

/** `GET /api/projects/:key/changes`. */
function useChanges(key: string) {
  return useQuery({ queryKey: ["changes", key], queryFn: () => getJson<ChangeList>(`/api/projects/${key}/changes`) })
}

/** The Changes page's state in the address, and the navigation that changes it. */
function useChangesQuery(key: string): [ChangesQuery, (next: ChangesQuery, replace?: boolean) => void] {
  const search = useSearch()
  const [, navigate] = useLocation()
  const query = useMemo(() => parseQuery(search), [search])
  const set = (next: ChangesQuery, replace = false) => navigate(`/${key}/changes?${queryString(next)}`, { replace })
  return [query, set]
}

export const cellSkeleton = (width: string): ReactNode => <Skeleton className={`h-5 ${width}`} />

export const EDGES = { edgeCell: "first:ps-4 last:pe-4" }
const LAYOUT = { headerSticky: true, headerBackground: false }

/**
 * A grid's scroll root: the grid container, its scroll viewport padded by the header row's height. The scroll area's
 * own wrapper is made a flex column so the area takes the height left and its viewport scrolls under the header row.
 */
export function GridFrame({ children }: { children: ReactNode }) {
  return (
    <div data-scroll-root className="flex min-h-0 flex-1 flex-col [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col">
      {children}
    </div>
  )
}

export const SCROLL_AREA = "min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:scroll-pt-10"

/** A table's search field: `label` is its placeholder and accessible name. */
export function SearchField({
  value,
  onChange,
  label = "Search changes",
}: {
  value: string
  onChange: (value: string) => void
  label?: string
}) {
  return (
    <InputGroup className="w-full sm:w-64">
      <InputGroupAddon align="inline-start">
        <SearchIcon aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        placeholder={label}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value !== "" ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onChange("")}>
            <XIcon aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}

function StatusFilter({
  checked,
  counts,
  onChange,
}: {
  checked: ActiveStatus[]
  counts: Record<ActiveStatus, number>
  onChange: (next: ActiveStatus[]) => void
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline">
            <FunnelIcon aria-hidden="true" />
            Status
            {checked.length > 0 ? <Badge variant="outline">{checked.length}</Badge> : null}
          </Button>
        }
      />
      <PopoverContent className="w-56" align="start">
        <div className="flex flex-col gap-3">
          <div className="text-xs font-medium text-muted-foreground">Status</div>
          {ACTIVE_STATUSES.map((status) => (
            <div key={status} className="flex items-center gap-2">
              <Checkbox
                id={`status-${status}`}
                checked={checked.includes(status)}
                onCheckedChange={(on) =>
                  onChange(on === true ? [...checked, status] : checked.filter((s) => s !== status))
                }
              />
              <Label htmlFor={`status-${status}`} className="flex grow items-center justify-between gap-2 font-normal">
                {STATUS_LABEL[status]}
                <span className="text-muted-foreground tabular-nums">{counts[status]}</span>
              </Label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Toolbar({ children, count }: { children: ReactNode; count: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-y px-4 py-2">
      {children}
      <span className="ml-auto text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {count}
      </span>
    </div>
  )
}

function ProgressCell({ progress }: { progress: { done: number; total: number } | null }) {
  if (progress === null) return <span className="text-muted-foreground">–</span>
  const { done, total } = progress
  return (
    <div className="flex items-center gap-2">
      <Progress value={total === 0 ? 0 : (done / total) * 100} className="w-24" aria-label={`${done} of ${total} tasks done`} />
      <span className="text-muted-foreground tabular-nums">
        {done}/{total}
      </span>
    </div>
  )
}

function changeHref(key: string, id: string): string {
  return `/${key}/changes/${id}?`
}

/** The Active view: the grid of the changes the search and the status filter keep, series as tree rows. */
function ActiveGrid({
  projectKey,
  rows,
  isLoading,
  narrowed,
}: {
  projectKey: string
  rows: ActiveRow[]
  isLoading: boolean
  narrowed: string
}) {
  const [, navigate] = useLocation()
  const [sorting, setSorting] = useState<SortingState>([])
  // Series rows start closed, or open while a search or a filter narrows the view.
  const [expansion, setExpansion] = useState<{ key: string; expanded: ExpandedState }>({ key: "", expanded: {} })
  const expanded: ExpandedState =
    expansion.key === narrowed
      ? expansion.expanded
      : narrowed === ""
        ? {}
        : Object.fromEntries(rows.filter((r) => r.kind === "series").map((r) => [r.id, true]))
  const setExpanded = (updater: Updater<ExpandedState>) =>
    setExpansion({ key: narrowed, expanded: typeof updater === "function" ? updater(expanded) : updater })

  const sort = sorting[0]
  const data = useMemo(
    () => (sort === undefined ? rows : sortRows(rows, { column: sort.id as SortColumn, desc: sort.desc })),
    [rows, sort]
  )

  const columns = useMemo<ColumnDef<DataGridFeatures, ActiveRow>[]>(
    () => [
      {
        id: "change",
        accessorFn: (row) => row.id,
        header: ({ column }) => <DataGridColumnHeader title="Change" column={column} />,
        cell: ({ row }) => {
          const item = row.original
          const second =
            item.kind === "series"
              ? `${item.count} changes`
              : item.change.status === "invalid"
                ? (item.change.issues[0] ?? "")
                : (item.change.description ?? "")
          return (
            <div className="flex min-w-0 items-center gap-1">
              {item.kind === "series" ? (
                <DataGridTableRowExpand row={row} className="-ms-2 -me-1" />
              ) : row.depth === 0 ? (
                <span aria-hidden="true" className="w-4 shrink-0" />
              ) : (
                <DataGridTableRowExpand row={row} className="-ms-2 -me-1" />
              )}
              <div className="flex min-w-0 flex-col">
                {item.kind === "series" ? (
                  <span className="truncate font-medium">{item.id}</span>
                ) : (
                  <Link
                    href={changeHref(projectKey, item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="truncate font-medium text-foreground hover:underline"
                  >
                    {item.id}
                  </Link>
                )}
                <OneLine text={second} className="text-muted-foreground" />
              </div>
            </div>
          )
        },
        size: 420,
        enableSorting: true,
        meta: { autoSize: true, skeleton: cellSkeleton("w-48") },
      },
      {
        id: "status",
        accessorFn: rowStatus,
        header: ({ column }) => <DataGridColumnHeader title="Status" column={column} />,
        cell: ({ row }) => {
          const item = row.original
          if (item.kind === "change" && item.change.status === "invalid") {
            return <StatusBadge status="invalid" tip={item.change.issues[0]} />
          }
          return <StatusBadge status={rowStatus(item)} />
        },
        size: 170,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-24") },
      },
      {
        id: "progress",
        accessorFn: (row) => row.id,
        header: ({ column }) => <DataGridColumnHeader title="Progress" column={column} />,
        cell: ({ row }) => {
          const item = row.original
          return <ProgressCell progress={item.kind === "series" ? item.progress : item.change.status === "invalid" ? null : item.change} />
        },
        size: 180,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-32") },
      },
      {
        id: "updated",
        accessorFn: (row) => (row.kind === "series" ? row.updated : row.change.updated),
        header: ({ column }) => <DataGridColumnHeader title="Updated" column={column} />,
        cell: ({ row }) => {
          const item = row.original
          return (
            <span className="text-muted-foreground tabular-nums">
              {localDate(item.kind === "series" ? item.updated : item.change.updated)}
            </span>
          )
        },
        size: 130,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-20") },
      },
    ],
    [projectKey]
  )

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data,
    getRowId: (row: ActiveRow) => row.id,
    getSubRows: (row: ActiveRow) => (row.kind === "series" ? row.children : undefined),
    state: { sorting, expanded },
    manualPagination: true,
    manualSorting: true,
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
  })

  return (
    <DataGrid
      table={table}
      recordCount={data.length}
      isLoading={isLoading}
      loadingMode="skeleton"
      tableLayout={LAYOUT}
      tableClassNames={EDGES}
      onRowClick={(row) => {
        if (row.kind === "series") setExpanded((old) => ({ ...(old as Record<string, boolean>), [row.id]: !(old as Record<string, boolean>)[row.id] }))
        else navigate(changeHref(projectKey, row.id))
      }}
    >
      <GridFrame>
        <DataGridScrollArea className={SCROLL_AREA}>
          <DataGridTable />
        </DataGridScrollArea>
      </GridFrame>
    </DataGrid>
  )
}

/** The Archived view: the archived changes whose ID holds the search, newest first, 25 a page. */
function ArchivedGrid({
  projectKey,
  rows,
  query,
  setQuery,
}: {
  projectKey: string
  rows: ArchivedChange[]
  query: ChangesQuery
  setQuery: (next: ChangesQuery) => void
}) {
  const [, navigate] = useLocation()
  const pagination: PaginationState = { pageIndex: shownPage(query.page, rows.length, query.size), pageSize: query.size }

  const columns = useMemo<ColumnDef<DataGridFeatures, ArchivedChange>[]>(
    () => [
      {
        id: "change",
        accessorFn: (row) => row.id,
        header: ({ column }) => <DataGridColumnHeader title="Change" column={column} />,
        cell: ({ row }) => (
          <Link
            href={`/${projectKey}/changes/archive/${row.original.dir}?`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.id}
          </Link>
        ),
        size: 420,
        enableSorting: false,
        meta: { autoSize: true, skeleton: cellSkeleton("w-48") },
      },
      {
        id: "archived",
        accessorFn: (row) => row.date,
        header: ({ column }) => <DataGridColumnHeader title="Archived" column={column} />,
        cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{row.original.date}</span>,
        size: 140,
        enableSorting: false,
        meta: { skeleton: cellSkeleton("w-20") },
      },
    ],
    [projectKey]
  )

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: rows,
    getRowId: (row: ArchivedChange) => row.dir,
    pageCount: Math.ceil(rows.length / query.size),
    state: { pagination },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater
      if (next.pageSize !== pagination.pageSize) setQuery({ ...query, size: next.pageSize, page: 1 })
      else if (next.pageIndex !== pagination.pageIndex) setQuery({ ...query, page: next.pageIndex + 1 })
    },
  })

  return (
    <DataGrid
      table={table}
      recordCount={rows.length}
      tableLayout={LAYOUT}
      tableClassNames={EDGES}
      onRowClick={(row) => navigate(`/${projectKey}/changes/archive/${row.dir}?`)}
    >
      <GridFrame>
        <DataGridScrollArea className={SCROLL_AREA}>
          <DataGridTable />
        </DataGridScrollArea>
      </GridFrame>
      <div className="border-t px-4 py-2">
        <DataGridPagination sizes={[...PAGE_SIZES]} />
      </div>
    </DataGrid>
  )
}

function NoMatch({ description, clear }: { description: string; clear: () => void }) {
  return (
    <Empty className="py-12">
      <EmptyHeader>
        <EmptyTitle>No change matches</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={clear}>
          Clear
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function NoChange({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Empty className="py-12">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

/** `#/<key>/changes`: the views Active and Archived of a project's changes. */
export function ChangesPage({ projectKey }: { projectKey: string }) {
  const changes = useChanges(projectKey)
  const queryClient = useQueryClient()
  const [query, setQuery] = useChangesQuery(projectKey)

  // The sidebar's count follows the list.
  useEffect(() => {
    if (changes.dataUpdatedAt > 0) void queryClient.invalidateQueries({ queryKey: ["projects"] })
  }, [changes.dataUpdatedAt, queryClient])

  const list = changes.data
  const rows = useMemo(
    () => (list === undefined ? [] : activeRows(list.active, query.q, query.statuses)),
    [list, query.q, query.statuses]
  )
  const archived = useMemo(() => (list === undefined ? [] : archivedRows(list.archived, query.q)), [list, query.q])
  const counts = useMemo(() => statusCounts(list?.active ?? [], query.q), [list, query.q])

  const clear = () => setQuery({ ...query, q: "", statuses: [], page: 1 })
  const narrowedActive = query.q.trim() !== "" || query.statuses.length > 0
  const narrowedArchived = query.q.trim() !== ""

  const top = <TopBar items={[{ label: "Changes" }, { selector: true }]} />

  if (changes.isError) {
    return (
      <>
        {top}
        <PageBody>
          <LoadError what="the changes" error={changes.error} retry={() => void changes.refetch()} className="m-4 w-auto" />
        </PageBody>
      </>
    )
  }

  const search = <SearchField value={query.q} onChange={(q) => setQuery({ ...query, q, page: 1 }, true)} />

  let body: ReactNode
  if (query.view === "active") {
    if (list !== undefined && list.active.length === 0) {
      body = (
        <NoChange title="No active change">
          Write one with <code className="font-mono">/theway:engineering</code> in this repository.
        </NoChange>
      )
    } else {
      const shown = changeCount(rows)
      body = (
        <>
          <Toolbar count={list === undefined ? null : countText(shown, list.active.length, narrowedActive)}>
            {search}
            <StatusFilter checked={query.statuses} counts={counts} onChange={(statuses) => setQuery({ ...query, statuses })} />
          </Toolbar>
          {list !== undefined && rows.length === 0 ? (
            <NoMatch description="Nothing in this project matches the search and the status filter." clear={clear} />
          ) : (
            <ActiveGrid
              projectKey={projectKey}
              rows={rows}
              isLoading={list === undefined}
              narrowed={narrowedActive ? `${query.q}|${query.statuses.join(",")}` : ""}
            />
          )}
        </>
      )
    }
  } else if (list !== undefined && list.archived.length === 0) {
    body = (
      <NoChange title="No archived change">
        Archive a finished change with <code className="font-mono">/theway:archive &lt;id&gt;</code>.
      </NoChange>
    )
  } else {
    body = (
      <>
        <Toolbar count={list === undefined ? null : countText(archived.length, list.archived.length, narrowedArchived)}>
          {search}
        </Toolbar>
        {list === undefined ? (
          <ArchivedLoading />
        ) : archived.length === 0 ? (
          <NoMatch description="No archived change of this project matches the search." clear={clear} />
        ) : (
          <ArchivedGrid projectKey={projectKey} rows={archived} query={query} setQuery={setQuery} />
        )}
      </>
    )
  }

  return (
    <>
      {top}
      <PageBody>
        <Tabs value={query.view} onValueChange={(view) => setQuery(switchView(query, view === "archived" ? "archived" : "active"))} className="shrink-0 gap-0">
          <TabsList variant="line" aria-label="Views" className="h-10 px-2">
            <TabsTrigger value="active" className="gap-2 px-2">
              Active
              {list !== undefined ? <Badge variant="secondary">{list.active.length}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="archived" className="gap-2 px-2">
              Archived
              {list !== undefined ? <Badge variant="secondary">{list.archived.length}</Badge> : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {body}
      </PageBody>
    </>
  )
}

/** The Archived grid's skeleton rows while the list loads. */
function ArchivedLoading() {
  const columns = useMemo<ColumnDef<DataGridFeatures, ArchivedChange>[]>(
    () => [
      {
        id: "change",
        header: ({ column }) => <DataGridColumnHeader title="Change" column={column} />,
        size: 420,
        meta: { autoSize: true, skeleton: cellSkeleton("w-48") },
      },
      {
        id: "archived",
        header: ({ column }) => <DataGridColumnHeader title="Archived" column={column} />,
        size: 140,
        meta: { skeleton: cellSkeleton("w-20") },
      },
    ],
    []
  )
  const table = useTable({ features: dataGridFeatures, columns, data: [] as ArchivedChange[] })
  return (
    <DataGrid table={table} recordCount={0} isLoading loadingMode="skeleton" tableLayout={LAYOUT} tableClassNames={EDGES}>
      <GridFrame>
        <DataGridScrollArea className={SCROLL_AREA}>
          <DataGridTable />
        </DataGridScrollArea>
      </GridFrame>
    </DataGrid>
  )
}
