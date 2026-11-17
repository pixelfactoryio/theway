import type { ColumnDef, SortingState } from "@tanstack/react-table"
import { useTable } from "@tanstack/react-table"
import { CircleCheckIcon, FileTextIcon, FolderIcon, ServerIcon, StarIcon } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { useLocation } from "wouter"

import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import { type BarField, FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { StatusMark } from "@/components/status"
import {
  appliesTo,
  byFile,
  compareText,
  fileMatches,
  filePath,
  fileValue,
  GLOBAL,
  type PromptRow,
  promptsByWorkflow,
  rowId,
  STATUS_VALUE_LABEL,
  WORKFLOW_FIELDS,
  type WorkflowRow,
  workflowValues,
} from "@/lib/files"
import { type FieldRule, fieldValues, NO_FILTER, NONE, passesAll, valueCounts } from "@/lib/list-filter"
import { cellSkeleton, GridFrame, SCROLL_AREA } from "@/components/list-grid"
import { Dash } from "@/components/file-page"
import { NewFileButton } from "@/components/new-file"
import { NameCell, NoFile, STATUS_HEADER, StatusCell, Wrapped } from "@/pages/files-table"
import { useLabel, usePrompts, useWorkflows } from "@/shell/files"
import { LoadError } from "@/shell/load-error"
import { useProjects } from "@/shell/projects"
import { PageBody, TopBar } from "@/shell/top-bar"

/** Columns resized by dragging a header's edge, live; wider than the page, the grid scrolls sideways. */
const LAYOUT = { headerSticky: true, columnsResizable: true, columnsResizeMode: "onChange" } as const
const PAGE = { pageIndex: 0, pageSize: 1000 }
/** No column is dragged narrower than its header's word. */
const COLUMN_DEFAULTS = { minSize: 72 }

/** The grid's column under the filter bar: the page's width, with its 24px gutters; the grid scrolls inside it. */
const COLUMN = "flex min-h-0 w-full flex-1 flex-col px-6"

const FIELD_LABEL: Record<(typeof WORKFLOW_FIELDS)[number], string> = {
  applies: "Applies to",
  runsOn: "Runs on",
  default: "Default",
  usesPrompt: "Uses prompt",
  status: "Status",
}

const FIELD_ICON: Record<(typeof WORKFLOW_FIELDS)[number], ReactNode> = {
  applies: <FolderIcon aria-hidden="true" />,
  runsOn: <ServerIcon aria-hidden="true" />,
  default: <StarIcon aria-hidden="true" />,
  usesPrompt: <FileTextIcon aria-hidden="true" />,
  status: <CircleCheckIcon aria-hidden="true" />,
}

/** The bar's fields over `all`, each value counted among `searched` with the other fields' rules applied. */
function workflowFields(
  all: readonly WorkflowRow[],
  searched: readonly WorkflowRow[],
  rules: readonly FieldRule[],
  valuesOf: (row: WorkflowRow, field: string) => readonly string[],
  prompts: readonly PromptRow[],
  label: (key: string) => string,
): BarField[] {
  const promptLabel = new Map(
    prompts.map((p) => [fileValue(p.name, p.project), p.project === null ? p.name : `${p.name} · ${label(p.project)}`]),
  )
  const valueLabel = (field: string, v: string): string => {
    if (field === "applies") return v === GLOBAL ? "All projects" : label(v)
    if (field === "runsOn") return v === NONE ? "No steps" : v
    if (field === "default") return v === "yes" ? "Default" : "Not default"
    if (field === "usesPrompt") return v === NONE ? "No prompt" : (promptLabel.get(v) ?? v)
    return STATUS_VALUE_LABEL[v as keyof typeof STATUS_VALUE_LABEL] ?? v
  }
  const fixed: Record<string, string[]> = {
    // Where steps run: the three places, then No steps when a workflow has none.
    runsOn: ["agents", "session", "mixed", ...(all.some((w) => w.runsOn === null) ? [NONE] : [])],
    default: ["yes", "no"],
    status: ["valid", "error"],
  }
  const valuesFor = (field: string): string[] =>
    fixed[field] ?? fieldValues(all, field, valuesOf, (v) => valueLabel(field, v))
  return WORKFLOW_FIELDS.map((id) => ({
    id,
    label: FIELD_LABEL[id],
    icon: FIELD_ICON[id],
    options: valuesFor(id).map((value) => ({
      value,
      label: valueLabel(id, value),
      icon: id === "status" ? <StatusMark status={value === "valid" ? "ready" : "invalid"} /> : undefined,
    })),
    counts: valueCounts(searched, id, rules, valuesOf),
  }))
}

type Column = "name" | "applies" | "steps" | "runsOn"

/** `rows` in the order of `sort`, ties broken by name then project. */
function sortWorkflows(
  rows: readonly WorkflowRow[],
  sort: { id: Column; desc: boolean } | undefined,
  label: (key: string) => string,
) {
  if (sort === undefined) return [...rows].sort(byFile)
  const sign = sort.desc ? -1 : 1
  const applies = (r: WorkflowRow) => appliesTo(r.project, label)
  const compare = (a: WorkflowRow, b: WorkflowRow): number => {
    if (sort.id === "name") return byFile(a, b)
    if (sort.id === "applies") return compareText(applies(a), applies(b))
    if (sort.id === "steps")
      return a.steps === b.steps ? 0 : a.steps === null ? 1 : b.steps === null ? -1 : a.steps - b.steps
    return compareText(a.runsOn, b.runsOn)
  }
  return [...rows].sort((a, b) => sign * compare(a, b) || byFile(a, b))
}

function WorkflowsGrid({ rows, isLoading }: { rows: WorkflowRow[]; isLoading: boolean }) {
  const [, navigate] = useLocation()
  const label = useLabel()
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }])
  const sort = sorting[0] as { id: Column; desc: boolean } | undefined
  const data = useMemo(() => sortWorkflows(rows, sort, label), [rows, sort, label])

  const columns = useMemo<ColumnDef<DataGridFeatures, WorkflowRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => <DataGridColumnHeader title="Workflow" column={column} />,
        cell: ({ row }) => (
          <NameCell
            href={`${filePath("workflows", row.original.project, row.original.name)}?`}
            name={row.original.name}
            description={row.original.description}
            isDefault={row.original.default}
          />
        ),
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
        size: 130,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-24") },
      },
      {
        id: "steps",
        accessorFn: (row) => row.steps,
        header: ({ column }) => <DataGridColumnHeader title="Steps" column={column} />,
        cell: ({ row }) => (row.original.steps === null ? <Dash /> : row.original.steps),
        size: 80,
        enableSorting: true,
        meta: {
          headerClassName: "text-right [&>div]:justify-end",
          cellClassName: "text-right tabular-nums",
          skeleton: cellSkeleton("ms-auto w-8"),
        },
      },
      {
        id: "runsOn",
        accessorFn: (row) => row.runsOn,
        header: ({ column }) => <DataGridColumnHeader title="Runs on" column={column} />,
        cell: ({ row }) => (row.original.runsOn === null ? <Dash /> : <Wrapped>{row.original.runsOn}</Wrapped>),
        size: 100,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-16") },
      },
      {
        id: "status",
        header: ({ column }) => <DataGridColumnHeader title="Status" column={column} className={STATUS_HEADER} />,
        cell: ({ row }) => <StatusCell errors={row.original.errors} />,
        size: 100,
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
    manualSorting: true,
    onSortingChange: setSorting,
  })

  return (
    <DataGrid
      table={table}
      recordCount={data.length}
      isLoading={isLoading}
      loadingMode="skeleton"
      tableLayout={LAYOUT}
      onRowClick={(row) => navigate(`${filePath("workflows", row.project, row.name)}?`)}
    >
      <GridFrame>
        <DataGridScrollArea className={SCROLL_AREA}>
          <DataGridTable />
        </DataGridScrollArea>
      </GridFrame>
    </DataGrid>
  )
}

/** `#/workflows`: every workflow file of the home, the global ones and each project's own. */
export function WorkflowsPage() {
  const workflows = useWorkflows()
  const projects = useProjects()
  const prompts = usePrompts()
  const [filter, setFilter] = useListFilter("workflows", WORKFLOW_FIELDS)
  const label = useLabel()
  const list = workflows.data
  const uses = useMemo(() => promptsByWorkflow(prompts.data?.prompts ?? []), [prompts.data])
  const valuesOf = useMemo(() => (row: WorkflowRow, field: string) => workflowValues(row, field, uses), [uses])
  const searched = useMemo(() => (list?.workflows ?? []).filter((w) => fileMatches(w, filter.q)), [list, filter.q])
  const rows = useMemo(
    () => searched.filter((w) => passesAll(w, filter.rules, valuesOf)),
    [searched, filter.rules, valuesOf],
  )
  const fields = useMemo(
    () => workflowFields(list?.workflows ?? [], searched, filter.rules, valuesOf, prompts.data?.prompts ?? [], label),
    [list, searched, filter.rules, valuesOf, prompts.data, label],
  )
  const top = (
    <TopBar items={[{ section: "Library" }, { label: "Workflows" }]} actions={<NewFileButton kind="workflows" />} />
  )

  if (workflows.isError || projects.isError) {
    return (
      <>
        {top}
        <PageBody>
          {workflows.isError ? (
            <LoadError
              what="the workflows"
              error={workflows.error}
              retry={() => void workflows.refetch()}
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
  if (loaded && list.workflows.length === 0) {
    return (
      <>
        {top}
        <PageBody>
          <NoFile
            title="No workflow yet"
            kind="YAML"
            folder={list.folder}
            action={<NewFileButton kind="workflows" variant="outline" />}
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
          searchLabel="Search workflows"
          shown={loaded ? rows.length : null}
          total={loaded ? list.workflows.length : null}
          noun="workflow"
        />
        {loaded && rows.length === 0 ? (
          <NoMatch nouns="workflows" filter={filter} fields={fields} onClear={() => setFilter(NO_FILTER)} />
        ) : (
          <div className={COLUMN}>
            <WorkflowsGrid rows={rows} isLoading={!loaded} />
          </div>
        )}
      </PageBody>
    </>
  )
}
