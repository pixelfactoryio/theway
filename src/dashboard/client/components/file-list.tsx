import type { ColumnDef, SortingState } from "@tanstack/react-table"
import { useTable } from "@tanstack/react-table"
import { cn } from "cn"
import { CopyIcon, FileTextIcon, TerminalIcon, WorkflowIcon } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { useLocation } from "wouter"

import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import { useCopy } from "@/components/copy"
import { type BarField, FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { ErrorsCell, NoFile, StatusCell } from "@/components/files-table"
import {
  cellSkeleton,
  GridFrame,
  LIST_CAP,
  LIST_FRAME,
  LIST_ROWS,
  ListFoot,
  SCROLL_AREA,
  SORT_HEADER,
  spareColumn,
  useSpare,
} from "@/components/list-grid"
import { NewFileButton } from "@/components/new-file"
import { type ReorderItem, ReorderMenu } from "@/components/reorder-menu"
import { StatusMark } from "@/components/status"
import { useLabel, useProjects } from "@/data/queries"
import { useRootScale } from "@/hooks/use-root-scale"
import { workflowCommand } from "@/lib/copy-targets"
import { appliesTo, byFile, compareText, fileMatches, rowId } from "@/lib/files"
import { type FieldRule, NO_FILTER, passesAll, valueCounts } from "@/lib/list-filter"
import { to } from "@/lib/routes"
import { PageLoadError } from "@/shell/load-error"
import { useLarge } from "@/shell/panel"
import { PageBody, PageHeader } from "@/shell/top-bar"

/**
 * Columns resized by dragging a header's edge, live; wider than the page, the grid scrolls sideways. The header row
 * sticks at the top of the list while its rows scroll; no rule between rows or columns, the hover fill keeps the place.
 */
const LAYOUT = {
  headerSticky: true,
  rowBorder: false,
  columnsResizable: true,
  columnsResizeMode: "onChange",
} as const
export const PAGE = { pageIndex: 0, pageSize: 1000 }
/**
 * No column is dragged narrower than its header's word. Column sizes are pixels at the 16px root, multiplied by the
 * root's scale (`scaled`) so a column grows with the text it holds.
 */
const COLUMN_MIN = 72

/** A column with its `size` and `minSize` multiplied by the root's `scale`. */
function scaled<Row extends FileRow>(
  column: ColumnDef<DataGridFeatures, Row>,
  scale: number,
): ColumnDef<DataGridFeatures, Row> {
  const size = (px: number | undefined) => (px === undefined ? undefined : Math.round(px * scale))
  return { ...column, size: size(column.size), minSize: size(column.minSize) }
}

/**
 * The grid's column under the filter bar: the page's width, edge to edge; the grid scrolls inside it, its rows one list
 * for J/K and the arrows.
 */
const COLUMN = cn("flex min-h-0 w-full flex-1 flex-col", LIST_FRAME)

/** The columns hidden under 1024px, so the list never scrolls sideways there: a prompt's Model, and Applies to. */
const NARROW_HIDDEN = { model: false, applies: false }

/** Each kind's icon, as the sidebar shows it. */
export const KIND_ICON = { workflows: WorkflowIcon, prompts: FileTextIcon } as const

/** A row of a file list: a workflow's or a prompt's. */
type FileRow = { name: string; project: string | null; description: string | null; errors: string[] }

/**
 * A list's columns, given a project's label: `lead` (the name's) and `extra` (the kind's own), in that order, after the
 * status icon and before the column every file list ends with, Applies to, whose value seldom differs.
 */
export type FileColumns<Row extends FileRow> = {
  lead: ColumnDef<DataGridFeatures, Row>[]
  extra: ColumnDef<DataGridFeatures, Row>[]
}

/** The status column's width: the 16px gutter, the 16px margin slot and 12px, then the 14px icon. */
const STATUS_WIDTH = 58

/** The actions column's width: 4px, the 28px "…" button, then the list's 16px right gutter. */
const ACTIONS_WIDTH = 48

/** The name column's edge: 8px after the status icon, as a list's name stands after its icon. */
const NAME_META = { headerClassName: "ps-2", cellClassName: "ps-2" }

/**
 * A name column's cell with the file's `N errors` badge after it, on the same line: the page's cell, then the badge
 * (nothing for a valid file).
 */
function withErrors<Row extends FileRow>(
  cell: ColumnDef<DataGridFeatures, Row>["cell"],
): ColumnDef<DataGridFeatures, Row>["cell"] {
  if (typeof cell !== "function") return cell
  return (context) => (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0">{cell(context)}</span>
      <ErrorsCell errors={context.row.original.errors} />
    </span>
  )
}

/**
 * A file row's "…" menu: Copy name, and on a workflow Copy run command (`workflowCommand`). A click on its button
 * opens the menu, not the file.
 */
function FileActions({ kind, name }: { kind: "workflows" | "prompts"; name: string }) {
  const { copy } = useCopy()
  const items: ReorderItem[] =
    kind === "workflows"
      ? [
          {
            label: "Copy name",
            icon: <CopyIcon aria-hidden="true" />,
            onSelect: () => copy(name, "the workflow name"),
          },
          {
            label: "Copy run command",
            icon: <TerminalIcon aria-hidden="true" />,
            onSelect: () => copy(workflowCommand(name).command, "the command"),
          },
        ]
      : [{ label: "Copy name", icon: <CopyIcon aria-hidden="true" />, onSelect: () => copy(name, "the prompt name") }]
  return (
    <ReorderMenu
      label={`${name} actions`}
      size="icon-sm"
      triggerClassName="text-muted-foreground"
      contentClassName="w-48"
      onTriggerClick={(event) => event.stopPropagation()}
      items={items}
    />
  )
}

/** The filter bar's values of a list: each field's values over every row, and a value's label. */
export type FieldOptions<F extends string> = {
  values: (field: F) => string[]
  label: (field: F, value: string) => string
}

/** A list's query, as the page loads it: its rows and folder once loaded, its error and refetch. */
type ListQuery = { isError: boolean; error: Error | null; refetch: () => unknown }

function FileGrid<Row extends FileRow>({
  kind,
  rows,
  isLoading,
  columns: columnsOf,
  spare,
}: {
  kind: "workflows" | "prompts"
  rows: readonly Row[]
  isLoading: boolean
  columns: (label: (key: string) => string) => FileColumns<Row>
  /** The room past the list's cap, left empty at the right. */
  spare: number
}) {
  const [, navigate] = useLocation()
  const label = useLabel()
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }])
  const columnVisibility = useLarge() ? {} : NARROW_HIDDEN
  const scale = useRootScale()
  // By file: the grid's sort keeps this order among the rows its column ties.
  const data = useMemo(() => [...rows].sort(byFile), [rows])

  const columns = useMemo<ColumnDef<DataGridFeatures, Row>[]>(() => {
    const { lead, extra } = columnsOf(label)
    const sized: ColumnDef<DataGridFeatures, Row>[] = [
      {
        // The row's status icon, where a list's rows hold theirs (`list-kit`): past the 16px gutter and the margin slot.
        id: "status",
        header: () => <span className="sr-only">Status</span>,
        cell: ({ row }) => <StatusCell errors={row.original.errors} />,
        size: STATUS_WIDTH,
        minSize: STATUS_WIDTH,
        enableSorting: false,
        enableResizing: false,
        meta: { headerClassName: "ps-11! pe-0", cellClassName: "ps-11! pe-0", skeleton: cellSkeleton("size-3.5") },
      },
      ...lead.map((column, i) =>
        i === 0 ? { ...column, cell: withErrors(column.cell), meta: { ...column.meta, ...NAME_META } } : column,
      ),
      ...extra,
      {
        id: "applies",
        accessorFn: (row) => appliesTo(row.project, label),
        header: ({ column }) => <DataGridColumnHeader title="Applies to" column={column} className={SORT_HEADER} />,
        cell: ({ row }) => appliesTo(row.original.project, label),
        sortFn: (a, b) => compareText(appliesTo(a.original.project, label), appliesTo(b.original.project, label)),
        size: 150,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-24") },
      },
      {
        // The row's "…" menu, on the list's 16px right gutter.
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <FileActions kind={kind} name={row.original.name} />,
        size: ACTIONS_WIDTH,
        minSize: ACTIONS_WIDTH,
        enableSorting: false,
        enableResizing: false,
        meta: { headerClassName: "ps-1 pe-4", cellClassName: "ps-1 pe-4", skeleton: cellSkeleton("size-3.5") },
      },
    ]
    // The spare column is measured in pixels: it is not scaled.
    return [...sized.map((column) => scaled(column, scale)), ...spareColumn<Row>(spare)]
  }, [columnsOf, label, spare, scale, kind])
  const defaultColumn = useMemo(() => ({ minSize: Math.round(COLUMN_MIN * scale) }), [scale])

  const table = useTable({
    features: dataGridFeatures,
    columns,
    defaultColumn,
    data,
    getRowId: rowId,
    state: isLoading ? { sorting, columnVisibility } : { sorting, columnVisibility, pagination: PAGE },
    manualPagination: true,
    onSortingChange: setSorting,
  })

  return (
    <DataGrid
      table={table}
      recordCount={data.length}
      isLoading={isLoading}
      loadingMode="skeleton"
      tableLayout={LAYOUT}
      tableClassNames={LIST_ROWS}
      onRowClick={(row) => navigate(to.file(kind, row.project, row.name))}
    >
      <GridFrame>
        <DataGridScrollArea className={SCROLL_AREA} data-nav-list="">
          <DataGridTable />
          <ListFoot />
        </DataGridScrollArea>
      </GridFrame>
    </DataGrid>
  )
}

/** The bar's fields over `all`, each value counted among `searched` with the other fields' rules applied. */
function barFields<Row, F extends string>(
  ids: readonly F[],
  options: FieldOptions<F>,
  searched: readonly Row[],
  rules: readonly FieldRule[],
  valuesOf: (row: Row, field: string) => readonly string[],
  fieldLabel: Record<F, string>,
  fieldIcon: Record<F, ReactNode>,
): BarField[] {
  return ids.map((id) => ({
    id,
    label: fieldLabel[id],
    icon: fieldIcon[id],
    options: options.values(id).map((value) => ({
      value,
      label: options.label(id, value),
      icon: id === "status" ? <StatusMark status={value === "valid" ? "ready" : "invalid"} /> : undefined,
    })),
    counts: valueCounts(searched, id, rules, valuesOf),
  }))
}

/**
 * `#/workflows` or `#/prompts`: every file of the kind, the global ones and each project's own, under a filter bar,
 * in a grid of one-line rows: the status icon, the name (with its `N errors`), the kind's own columns, then Applies
 * to. `options` and `columns` should keep their identity between renders.
 */
export function FileListPage<Row extends FileRow, F extends string>({
  kind,
  query,
  list,
  fields,
  valuesOf,
  options,
  fieldLabel,
  fieldIcon,
  columns,
  noun,
  nouns,
  searchLabel,
  emptyTitle,
  fileType,
}: {
  kind: "workflows" | "prompts"
  query: ListQuery
  /** The loaded rows and the folder they live in; `undefined` while the list loads. */
  list: { rows: readonly Row[]; folder: string } | undefined
  fields: readonly F[]
  valuesOf: (row: Row, field: string) => readonly string[]
  /** Built from every row: the page's field builder. */
  options: (all: readonly Row[]) => FieldOptions<F>
  fieldLabel: Record<F, string>
  fieldIcon: Record<F, ReactNode>
  columns: (label: (key: string) => string) => FileColumns<Row>
  noun: string
  nouns: string
  searchLabel: string
  emptyTitle: string
  fileType: string
}) {
  const projects = useProjects()
  const { spare, sizer } = useSpare(LIST_CAP.files)
  const [filter, setFilter] = useListFilter(kind, fields)
  const all = useMemo(() => list?.rows ?? [], [list])
  const searched = useMemo(() => all.filter((r) => fileMatches(r, filter.q)), [all, filter.q])
  const rows = useMemo(
    () => searched.filter((r) => passesAll(r, filter.rules, valuesOf)),
    [searched, filter.rules, valuesOf],
  )
  const bar = useMemo(
    () => barFields(fields, options(all), searched, filter.rules, valuesOf, fieldLabel, fieldIcon),
    [fields, options, all, searched, filter.rules, valuesOf, fieldLabel, fieldIcon],
  )
  const top = (
    <PageHeader
      title={nouns.charAt(0).toUpperCase() + nouns.slice(1)}
      icon={KIND_ICON[kind]}
      actions={<NewFileButton kind={kind} />}
    />
  )

  if (query.isError || projects.isError) {
    return (
      <>
        {top}
        <PageBody>
          {query.isError ? (
            <PageLoadError what={`the ${nouns}`} error={query.error as Error} retry={() => void query.refetch()} />
          ) : (
            <PageLoadError what="the projects" error={projects.error as Error} retry={() => void projects.refetch()} />
          )}
        </PageBody>
      </>
    )
  }

  const loaded = list !== undefined && projects.data !== undefined
  if (loaded && list.rows.length === 0) {
    return (
      <>
        {top}
        <PageBody>
          <NoFile
            title={emptyTitle}
            kind={fileType}
            folder={list.folder}
            action={<NewFileButton kind={kind} variant="outline" />}
          />
        </PageBody>
      </>
    )
  }
  return (
    <>
      {top}
      <PageBody>
        <FilterBar
          fields={bar}
          filter={filter}
          onChange={setFilter}
          searchLabel={searchLabel}
          shown={loaded ? rows.length : null}
          total={loaded ? list.rows.length : null}
          noun={noun}
        />
        {loaded && rows.length === 0 ? (
          <NoMatch nouns={nouns} filter={filter} fields={bar} onClear={() => setFilter(NO_FILTER)} />
        ) : (
          <div className={COLUMN}>
            {sizer}
            <FileGrid kind={kind} rows={rows} isLoading={!loaded} columns={columns} spare={spare} />
          </div>
        )}
      </PageBody>
    </>
  )
}
