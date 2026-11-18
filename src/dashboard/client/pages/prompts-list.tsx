import { cn } from "cn"
import type { ColumnDef, SortingState } from "@tanstack/react-table"
import { useTable } from "@tanstack/react-table"
import { CircleCheckIcon, CpuIcon, FolderIcon, ShapesIcon, WorkflowIcon } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { Link, useLocation } from "wouter"

import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { type BarField, FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { StatusMark } from "@/components/status"
import { useLabel, useProjects, usePrompts } from "@/data/queries"
import {
  appliesTo,
  byFile,
  compareText,
  fileMatches,
  fileValue,
  GLOBAL,
  KIND_LABEL,
  kindOf,
  KINDS,
  PROMPT_FIELDS,
  type PromptKind,
  type PromptRow,
  promptValues,
  rowId,
  STATUS_VALUE_LABEL,
  type Use,
  describeUse,
} from "@/lib/files"
import { type FieldRule, fieldValues, NO_FILTER, NONE, passesAll, valueCounts } from "@/lib/list-filter"
import { to } from "@/lib/routes"
import { cellSkeleton, GridFrame, SCROLL_AREA } from "@/components/list-grid"
import { Dash } from "@/components/file-page"
import { NewFileButton } from "@/components/new-file"
import { NameCell, NoFile, STATUS_HEADER, StatusCell, WRAP, Wrapped } from "@/pages/files-table"
import { LoadError } from "@/shell/load-error"
import { PageBody, PageHeader } from "@/shell/top-bar"

/** Columns resized by dragging a header's edge, live; wider than the page, the grid scrolls sideways. */
const LAYOUT = { headerSticky: true, columnsResizable: true, columnsResizeMode: "onChange" } as const
const PAGE = { pageIndex: 0, pageSize: 1000 }
/** No column is dragged narrower than its header's word. */
const COLUMN_DEFAULTS = { minSize: 72 }

/** The grid's column under the filter bar: the page's width, with its 24px gutters; the grid scrolls inside it. */
const COLUMN = "flex min-h-0 w-full flex-1 flex-col px-6"

/** A use's link: to its workflow's page. */
function UseLink({ use, children, className }: { use: Use; children: string; className?: string }) {
  return (
    <Link
      href={to.file("workflows", use.project, use.workflow)}
      onClick={(e) => e.stopPropagation()}
      className={className ?? "underline-offset-4 hover:underline"}
    >
      {children}
    </Link>
  )
}

/** The Used by cell: the first workflow, wrapping when the column is narrow, then `+N` opening every use. */
function UsedByCell({ row }: { row: PromptRow }) {
  const label = useLabel()
  const first = row.usedBy[0]
  if (first === undefined) return <Dash />
  const name = first.project === null ? first.workflow : `${first.workflow} · ${label(first.project)}`
  return (
    <div className={cn(WRAP, "flex flex-wrap items-center gap-1")}>
      <UseLink use={first} className="min-w-0 hover:underline">
        {name}
      </UseLink>
      {row.usedBy.length > 1 ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="xs"
                className="tabular-nums"
                aria-label={`${row.usedBy.length} uses of ${row.name}`}
                onClick={(e) => e.stopPropagation()}
              />
            }
          >
            +{row.usedBy.length - 1}
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start" onClick={(e) => e.stopPropagation()}>
            <ul className="flex flex-col gap-2 text-sm">
              {row.usedBy.map((use, i) => (
                <li key={i}>
                  <UseLink use={use}>{describeUse(use, label)}</UseLink>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}

const FIELD_LABEL: Record<(typeof PROMPT_FIELDS)[number], string> = {
  kind: "Kind",
  applies: "Applies to",
  model: "Model",
  usedBy: "Used by",
  status: "Status",
}

const FIELD_ICON: Record<(typeof PROMPT_FIELDS)[number], ReactNode> = {
  kind: <ShapesIcon aria-hidden="true" />,
  applies: <FolderIcon aria-hidden="true" />,
  model: <CpuIcon aria-hidden="true" />,
  usedBy: <WorkflowIcon aria-hidden="true" />,
  status: <CircleCheckIcon aria-hidden="true" />,
}

/** The bar's fields over `all`, each value counted among `searched` with the other fields' rules applied. */
function promptFields(
  all: readonly PromptRow[],
  searched: readonly PromptRow[],
  rules: readonly FieldRule[],
  label: (key: string) => string,
): BarField[] {
  const uses = new Map(
    all.flatMap((p) =>
      p.usedBy.map((u) => [
        fileValue(u.workflow, u.project),
        u.project === null ? u.workflow : `${u.workflow} · ${label(u.project)}`,
      ]),
    ),
  )
  const valueLabel = (field: string, v: string): string => {
    if (field === "kind") return KIND_LABEL[v as PromptKind] ?? v
    if (field === "applies") return v === GLOBAL ? "All projects" : label(v)
    if (field === "model") return v === NONE ? "None" : v
    if (field === "usedBy") return v === NONE ? "No workflow" : (uses.get(v) ?? v)
    return STATUS_VALUE_LABEL[v as keyof typeof STATUS_VALUE_LABEL] ?? v
  }
  const valuesFor = (field: string): string[] =>
    field === "kind"
      ? [...KINDS]
      : field === "status"
        ? ["valid", "error"]
        : fieldValues(all, field, promptValues, (v) => valueLabel(field, v))
  return PROMPT_FIELDS.map((id) => ({
    id,
    label: FIELD_LABEL[id],
    icon: FIELD_ICON[id],
    options: valuesFor(id).map((value) => ({
      value,
      label: valueLabel(id, value),
      icon: id === "status" ? <StatusMark status={value === "valid" ? "ready" : "invalid"} /> : undefined,
    })),
    counts: valueCounts(searched, id, rules, promptValues),
  }))
}

function PromptsGrid({ rows, isLoading }: { rows: PromptRow[]; isLoading: boolean }) {
  const [, navigate] = useLocation()
  const label = useLabel()
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }])
  // By file: the grid's sort keeps this order among the rows its column ties.
  const data = useMemo(() => [...rows].sort(byFile), [rows])

  const columns = useMemo<ColumnDef<DataGridFeatures, PromptRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => <DataGridColumnHeader title="Prompt" column={column} />,
        cell: ({ row }) => (
          <NameCell
            href={to.file("prompts", row.original.project, row.original.name)}
            name={row.original.name}
            description={row.original.description}
          />
        ),
        sortFn: (a, b) => byFile(a.original, b.original),
        size: 280,
        minSize: 200,
        enableSorting: true,
        meta: { autoSize: true, skeleton: cellSkeleton("w-48") },
      },
      {
        id: "applies",
        accessorFn: (row) => appliesTo(row.project, label),
        header: ({ column }) => <DataGridColumnHeader title="Applies to" column={column} />,
        cell: ({ row }) => <Wrapped>{appliesTo(row.original.project, label)}</Wrapped>,
        sortFn: (a, b) => compareText(appliesTo(a.original.project, label), appliesTo(b.original.project, label)),
        size: 130,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-24") },
      },
      {
        id: "kind",
        accessorFn: (row) => KIND_LABEL[kindOf(row)],
        header: ({ column }) => <DataGridColumnHeader title="Kind" column={column} />,
        cell: ({ row }) => <Wrapped>{KIND_LABEL[kindOf(row.original)]}</Wrapped>,
        sortFn: (a, b) => compareText(KIND_LABEL[kindOf(a.original)], KIND_LABEL[kindOf(b.original)]),
        size: 130,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-24") },
      },
      {
        id: "model",
        accessorFn: (row) => row.model,
        header: ({ column }) => <DataGridColumnHeader title="Model" column={column} />,
        cell: ({ row }) => (row.original.model === null ? <Dash /> : <Wrapped>{row.original.model}</Wrapped>),
        sortFn: (a, b) => compareText(a.original.model, b.original.model),
        size: 100,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-12") },
      },
      {
        id: "usedBy",
        accessorFn: (row) => row.usedBy[0]?.workflow ?? null,
        header: ({ column }) => <DataGridColumnHeader title="Used by" column={column} />,
        cell: ({ row }) => <UsedByCell row={row.original} />,
        sortFn: (a, b) => compareText(a.original.usedBy[0]?.workflow ?? null, b.original.usedBy[0]?.workflow ?? null),
        size: 170,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-24") },
      },
      {
        id: "status",
        header: ({ column }) => <DataGridColumnHeader title="Status" column={column} className={STATUS_HEADER} />,
        cell: ({ row }) => <StatusCell errors={row.original.errors} />,
        size: 120,
        enableSorting: false,
        meta: { skeleton: cellSkeleton("w-16") },
      },
    ],
    [label],
  )

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
      onRowClick={(row) => navigate(to.file("prompts", row.project, row.name))}
    >
      <GridFrame>
        <DataGridScrollArea className={SCROLL_AREA}>
          <DataGridTable />
        </DataGridScrollArea>
      </GridFrame>
    </DataGrid>
  )
}

/** `#/prompts`: every prompt file of the home, the global ones and each project's own. */
export function PromptsPage() {
  const prompts = usePrompts()
  const projects = useProjects()
  const [filter, setFilter] = useListFilter("prompts", PROMPT_FIELDS)
  const label = useLabel()
  const list = prompts.data
  const searched = useMemo(() => (list?.prompts ?? []).filter((p) => fileMatches(p, filter.q)), [list, filter.q])
  const rows = useMemo(() => searched.filter((p) => passesAll(p, filter.rules, promptValues)), [searched, filter.rules])
  const fields = useMemo(
    () => promptFields(list?.prompts ?? [], searched, filter.rules, label),
    [list, searched, filter.rules, label],
  )
  const top = <PageHeader title="Prompts" actions={<NewFileButton kind="prompts" />} />

  if (prompts.isError || projects.isError) {
    return (
      <>
        {top}
        <PageBody>
          {prompts.isError ? (
            <LoadError
              what="the prompts"
              error={prompts.error}
              retry={() => void prompts.refetch()}
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
  if (loaded && list.prompts.length === 0) {
    return (
      <>
        {top}
        <PageBody>
          <NoFile
            title="No prompt yet"
            kind="Markdown"
            folder={list.folder}
            action={<NewFileButton kind="prompts" variant="outline" />}
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
          fields={fields}
          filter={filter}
          onChange={setFilter}
          searchLabel="Search prompts"
          shown={loaded ? rows.length : null}
          total={loaded ? list.prompts.length : null}
          noun="prompt"
        />
        {loaded && rows.length === 0 ? (
          <NoMatch nouns="prompts" filter={filter} fields={fields} onClear={() => setFilter(NO_FILTER)} />
        ) : (
          <div className={COLUMN}>
            <PromptsGrid rows={rows} isLoading={!loaded} />
          </div>
        )}
      </PageBody>
    </>
  )
}
