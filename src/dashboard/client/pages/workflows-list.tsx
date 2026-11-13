import type { ColumnDef, SortingState } from "@tanstack/react-table"
import { useTable } from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { useLocation } from "wouter"

import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import { appliesTo, byFile, compareText, fileCountText, fileMatches, filePath, rowId, type WorkflowRow } from "@/lib/files"
import { cellSkeleton, EDGES, GridFrame, SCROLL_AREA, SearchField } from "@/pages/changes-list"
import { NewFileButton } from "@/components/new-file"
import { FilesToolbar, NameCell, NoFile, NoFileMatch, None, STATUS_HEADER, StatusCell, useFilesQuery } from "@/pages/files-table"
import { useLabel, useWorkflows } from "@/shell/files"
import { LoadError } from "@/shell/load-error"
import { useProjects } from "@/shell/projects"
import { PageBody, TopBar } from "@/shell/top-bar"

const LAYOUT = { headerSticky: true }
const PAGE = { pageIndex: 0, pageSize: 1000 }

type Column = "name" | "applies" | "steps" | "runsOn"

/** `rows` in the order of `sort`, ties broken by name then project. */
function sortWorkflows(rows: readonly WorkflowRow[], sort: { id: Column; desc: boolean } | undefined, label: (key: string) => string) {
  if (sort === undefined) return [...rows].sort(byFile)
  const sign = sort.desc ? -1 : 1
  const applies = (r: WorkflowRow) => appliesTo(r.project, label)
  const compare = (a: WorkflowRow, b: WorkflowRow): number => {
    if (sort.id === "name") return byFile(a, b)
    if (sort.id === "applies") return compareText(applies(a), applies(b))
    if (sort.id === "steps") return a.steps === b.steps ? 0 : a.steps === null ? 1 : b.steps === null ? -1 : a.steps - b.steps
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
        size: 420,
        enableSorting: true,
        meta: { autoSize: true, skeleton: cellSkeleton("w-48") },
      },
      {
        id: "applies",
        accessorFn: (row) => appliesTo(row.project, label),
        header: ({ column }) => <DataGridColumnHeader title="Applies to" column={column} />,
        cell: ({ row }) => appliesTo(row.original.project, label),
        size: 150,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-24") },
      },
      {
        id: "steps",
        accessorFn: (row) => row.steps,
        header: ({ column }) => <DataGridColumnHeader title="Steps" column={column} />,
        cell: ({ row }) => (row.original.steps === null ? <None /> : row.original.steps),
        size: 90,
        enableSorting: true,
        meta: { headerClassName: "text-right [&>div]:justify-end", cellClassName: "text-right tabular-nums", skeleton: cellSkeleton("ms-auto w-8") },
      },
      {
        id: "runsOn",
        accessorFn: (row) => row.runsOn,
        header: ({ column }) => <DataGridColumnHeader title="Runs on" column={column} />,
        cell: ({ row }) => (row.original.runsOn === null ? <None /> : row.original.runsOn),
        size: 120,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-16") },
      },
      {
        id: "status",
        header: ({ column }) => <DataGridColumnHeader title="Status" column={column} className={STATUS_HEADER} />,
        cell: ({ row }) => <StatusCell errors={row.original.errors} />,
        size: 130,
        enableSorting: false,
        meta: { skeleton: cellSkeleton("w-16") },
      },
    ],
    [label]
  )

  const table = useTable({
    features: dataGridFeatures,
    columns,
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
      tableClassNames={EDGES}
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
  const [query, setQuery] = useFilesQuery("workflows")
  const list = workflows.data
  const rows = useMemo(() => (list === undefined ? [] : list.workflows.filter((w) => fileMatches(w, query.q))), [list, query.q])
  const top = <TopBar items={[{ label: "Workflows" }]} actions={<NewFileButton kind="workflows" />} />

  if (workflows.isError || projects.isError) {
    return (
      <>
        {top}
        <PageBody>
          {workflows.isError ? (
            <LoadError what="the workflows" error={workflows.error} retry={() => void workflows.refetch()} className="m-4 w-auto" />
          ) : (
            <LoadError what="the projects" error={projects.error as Error} retry={() => void projects.refetch()} className="m-4 w-auto" />
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
          <NoFile title="No workflow yet" kind="YAML" folder={list.folder} action={<NewFileButton kind="workflows" variant="outline" />} />
        </PageBody>
      </>
    )
  }
  const narrowed = query.q.trim() !== ""
  return (
    <>
      {top}
      <PageBody>
        <FilesToolbar count={loaded ? fileCountText(rows.length, list.workflows.length, narrowed, "workflow") : null}>
          <SearchField label="Search workflows" value={query.q} onChange={(q) => setQuery({ ...query, q }, true)} />
        </FilesToolbar>
        {loaded && rows.length === 0 ? (
          <NoFileMatch title="No workflow matches" clear={() => setQuery({ q: "", kind: null })} />
        ) : (
          <WorkflowsGrid rows={rows} isLoading={!loaded} />
        )}
      </PageBody>
    </>
  )
}
