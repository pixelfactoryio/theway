import type { ColumnDef, SortingState } from "@tanstack/react-table"
import { useTable } from "@tanstack/react-table"
import { type ReactNode, useMemo, useState } from "react"
import { useLocation } from "wouter"

import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import { type BarField, FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { NoFile, StatusCell, Wrapped } from "@/components/files-table"
import { cellSkeleton, ColumnLabel, GridFrame, SCROLL_AREA, SORT_HEADER } from "@/components/list-grid"
import { NewFileButton } from "@/components/new-file"
import { StatusMark } from "@/components/status"
import { useLabel, useProjects } from "@/data/queries"
import { appliesTo, byFile, compareText, fileMatches, rowId } from "@/lib/files"
import { type FieldRule, NO_FILTER, passesAll, valueCounts } from "@/lib/list-filter"
import { to } from "@/lib/routes"
import { LoadError } from "@/shell/load-error"
import { PageBody, PageHeader } from "@/shell/top-bar"

/** Columns resized by dragging a header's edge, live; wider than the page, the grid scrolls sideways. */
const LAYOUT = { headerSticky: true, columnsResizable: true, columnsResizeMode: "onChange" } as const
export const PAGE = { pageIndex: 0, pageSize: 1000 }
/** No column is dragged narrower than its header's word. */
export const COLUMN_DEFAULTS = { minSize: 72 }

/** The grid's column under the filter bar: the page's width, with its 24px gutters; the grid scrolls inside it. */
const COLUMN = "flex min-h-0 w-full flex-1 flex-col px-6"

/** A row of a file list: a workflow's or a prompt's. */
type FileRow = { name: string; project: string | null; description: string | null; errors: string[] }

/** A list's columns, given a project's label: those before Applies to (the name's), and those between it and Status. */
export type FileColumns<Row extends FileRow> = {
  lead: ColumnDef<DataGridFeatures, Row>[]
  extra: ColumnDef<DataGridFeatures, Row>[]
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
}: {
  kind: "workflows" | "prompts"
  rows: readonly Row[]
  isLoading: boolean
  columns: (label: (key: string) => string) => FileColumns<Row>
}) {
  const [, navigate] = useLocation()
  const label = useLabel()
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }])
  // By file: the grid's sort keeps this order among the rows its column ties.
  const data = useMemo(() => [...rows].sort(byFile), [rows])

  const columns = useMemo<ColumnDef<DataGridFeatures, Row>[]>(() => {
    const { lead, extra } = columnsOf(label)
    return [
      ...lead,
      {
        id: "applies",
        accessorFn: (row) => appliesTo(row.project, label),
        header: ({ column }) => <DataGridColumnHeader title="Applies to" column={column} className={SORT_HEADER} />,
        cell: ({ row }) => <Wrapped>{appliesTo(row.original.project, label)}</Wrapped>,
        sortFn: (a, b) => compareText(appliesTo(a.original.project, label), appliesTo(b.original.project, label)),
        size: 130,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-24") },
      },
      ...extra,
      {
        id: "status",
        header: () => <ColumnLabel>Status</ColumnLabel>,
        cell: ({ row }) => <StatusCell errors={row.original.errors} />,
        size: 120,
        enableSorting: false,
        meta: { skeleton: cellSkeleton("w-16") },
      },
    ]
  }, [columnsOf, label])

  const table = useTable({
    features: dataGridFeatures,
    columns,
    defaultColumn: COLUMN_DEFAULTS,
    data,
    getRowId: rowId,
    state: isLoading ? { sorting } : { sorting, pagination: PAGE },
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
      onRowClick={(row) => navigate(to.file(kind, row.project, row.name))}
    >
      <GridFrame>
        <DataGridScrollArea className={SCROLL_AREA}>
          <DataGridTable />
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
 * in a grid of the name, Applies to, the kind's own columns and Status. `options` and `columns` should keep their
 * identity between renders.
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
    <PageHeader title={nouns.charAt(0).toUpperCase() + nouns.slice(1)} actions={<NewFileButton kind={kind} />} />
  )

  if (query.isError || projects.isError) {
    return (
      <>
        {top}
        <PageBody>
          {query.isError ? (
            <LoadError
              what={`the ${nouns}`}
              error={query.error as Error}
              retry={() => void query.refetch()}
              className="m-4 w-auto"
            />
          ) : (
            <LoadError
              what="the projects"
              error={projects.error as Error}
              retry={() => void projects.refetch()}
              className="m-4 w-auto"
            />
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
            <FileGrid kind={kind} rows={rows} isLoading={!loaded} columns={columns} />
          </div>
        )}
      </PageBody>
    </>
  )
}
