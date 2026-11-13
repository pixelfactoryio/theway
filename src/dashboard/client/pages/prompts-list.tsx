import type { ColumnDef, SortingState } from "@tanstack/react-table"
import { useTable } from "@tanstack/react-table"
import { FunnelIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useLocation } from "wouter"

import { Badge } from "@/components/reui/badge"
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  appliesTo,
  byFile,
  checkedKinds,
  compareText,
  fileCountText,
  fileMatches,
  filePath,
  KIND_FILTER_LABEL,
  KIND_LABEL,
  kindCounts,
  kindOf,
  kindOfChecked,
  KINDS,
  type PromptKind,
  type PromptRow,
  rowId,
  type Use,
  useText,
} from "@/lib/files"
import { cellSkeleton, EDGES, GridFrame, SCROLL_AREA, SearchField } from "@/pages/changes-list"
import { NewFileButton } from "@/components/new-file"
import { FilesToolbar, NameCell, NoFile, NoFileMatch, None, StatusCell, useFilesQuery } from "@/pages/files-table"
import { useLabel, usePrompts } from "@/shell/files"
import { LoadError } from "@/shell/load-error"
import { useProjects } from "@/shell/projects"
import { PageBody, TopBar } from "@/shell/top-bar"

const LAYOUT = { headerSticky: true }
const PAGE = { pageIndex: 0, pageSize: 1000 }

type Column = "name" | "applies" | "kind" | "model" | "usedBy"

/** `rows` in the order of `sort`, ties broken by name then project. */
function sortPrompts(rows: readonly PromptRow[], sort: { id: Column; desc: boolean } | undefined, label: (key: string) => string) {
  if (sort === undefined) return [...rows].sort(byFile)
  const sign = sort.desc ? -1 : 1
  const compare = (a: PromptRow, b: PromptRow): number => {
    if (sort.id === "name") return byFile(a, b)
    if (sort.id === "applies") return compareText(appliesTo(a.project, label), appliesTo(b.project, label))
    if (sort.id === "kind") return compareText(KIND_LABEL[kindOf(a)], KIND_LABEL[kindOf(b)])
    if (sort.id === "model") return compareText(a.model, b.model)
    return compareText(a.usedBy[0]?.workflow ?? null, b.usedBy[0]?.workflow ?? null)
  }
  return [...rows].sort((a, b) => sign * compare(a, b) || byFile(a, b))
}

/** A use's link: to its workflow's page. */
function UseLink({ use, children, className }: { use: Use; children: string; className?: string }) {
  return (
    <Link
      href={`${filePath("workflows", use.project, use.workflow)}?`}
      onClick={(e) => e.stopPropagation()}
      className={className ?? "underline-offset-4 hover:underline"}
    >
      {children}
    </Link>
  )
}

/** The Used by cell: the first workflow, then `+N` opening every use. */
function UsedByCell({ row }: { row: PromptRow }) {
  const label = useLabel()
  const first = row.usedBy[0]
  if (first === undefined) return <None />
  const name = first.project === null ? first.workflow : `${first.workflow} · ${label(first.project)}`
  return (
    <div className="flex items-center gap-1">
      <UseLink use={first} className="truncate hover:underline">
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
                  <UseLink use={use}>{useText(use, label)}</UseLink>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}

function KindFilter({
  checked,
  counts,
  onChange,
}: {
  checked: PromptKind[]
  counts: Record<PromptKind, number>
  onChange: (next: PromptKind[]) => void
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline">
            <FunnelIcon aria-hidden="true" />
            Kind
            {checked.length > 0 ? <Badge variant="outline">{checked.length}</Badge> : null}
          </Button>
        }
      />
      <PopoverContent className="w-56" align="start">
        <div className="flex flex-col gap-3">
          <div className="text-xs font-medium text-muted-foreground">Kind</div>
          {KINDS.map((kind) => (
            <div key={kind} className="flex items-center gap-2">
              <Checkbox
                id={`kind-${kind}`}
                checked={checked.includes(kind)}
                onCheckedChange={(on) => onChange(on === true ? [...checked, kind] : checked.filter((k) => k !== kind))}
              />
              <Label htmlFor={`kind-${kind}`} className="flex grow items-center justify-between gap-2 font-normal">
                {KIND_FILTER_LABEL[kind]}
                <span className="text-muted-foreground tabular-nums">{counts[kind]}</span>
              </Label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PromptsGrid({ rows, isLoading }: { rows: PromptRow[]; isLoading: boolean }) {
  const [, navigate] = useLocation()
  const label = useLabel()
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }])
  const sort = sorting[0] as { id: Column; desc: boolean } | undefined
  const data = useMemo(() => sortPrompts(rows, sort, label), [rows, sort, label])

  const columns = useMemo<ColumnDef<DataGridFeatures, PromptRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => <DataGridColumnHeader title="Prompt" column={column} />,
        cell: ({ row }) => (
          <NameCell
            href={`${filePath("prompts", row.original.project, row.original.name)}?`}
            name={row.original.name}
            description={row.original.description}
          />
        ),
        size: 380,
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
        id: "kind",
        accessorFn: (row) => KIND_LABEL[kindOf(row)],
        header: ({ column }) => <DataGridColumnHeader title="Kind" column={column} />,
        cell: ({ row }) => KIND_LABEL[kindOf(row.original)],
        size: 140,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-24") },
      },
      {
        id: "model",
        accessorFn: (row) => row.model,
        header: ({ column }) => <DataGridColumnHeader title="Model" column={column} />,
        cell: ({ row }) => (row.original.model === null ? <None /> : row.original.model),
        size: 100,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-12") },
      },
      {
        id: "usedBy",
        accessorFn: (row) => row.usedBy[0]?.workflow ?? null,
        header: ({ column }) => <DataGridColumnHeader title="Used by" column={column} />,
        cell: ({ row }) => <UsedByCell row={row.original} />,
        size: 170,
        enableSorting: true,
        meta: { skeleton: cellSkeleton("w-24") },
      },
      {
        id: "status",
        header: ({ column }) => <DataGridColumnHeader title="Status" column={column} />,
        cell: ({ row }) => <StatusCell errors={row.original.errors} />,
        size: 120,
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
      onRowClick={(row) => navigate(`${filePath("prompts", row.project, row.name)}?`)}
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
  const [query, setQuery] = useFilesQuery("prompts")
  // Both rows checked filter nothing, as none do: the address then holds no `kind`, and the page keeps the two checks.
  const [both, setBoth] = useState(false)
  const checked = query.kind === null && both ? [...KINDS] : checkedKinds(query.kind)
  const list = prompts.data
  const rows = useMemo(
    () =>
      list === undefined
        ? []
        : list.prompts.filter((p) => fileMatches(p, query.q) && (query.kind === null || kindOf(p) === query.kind)),
    [list, query.q, query.kind]
  )
  const counts = useMemo(() => kindCounts(list?.prompts ?? [], query.q), [list, query.q])
  const top = <TopBar items={[{ label: "Prompts" }]} actions={<NewFileButton kind="prompts" />} />

  if (prompts.isError || projects.isError) {
    return (
      <>
        {top}
        <PageBody>
          {prompts.isError ? (
            <LoadError what="the prompts" error={prompts.error} retry={() => void prompts.refetch()} className="m-4 w-auto" />
          ) : (
            <LoadError what="the projects" error={projects.error as Error} retry={() => void projects.refetch()} className="m-4 w-auto" />
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
          <NoFile title="No prompt yet" kind="Markdown" folder={list.folder} action={<NewFileButton kind="prompts" variant="outline" />} />
        </PageBody>
      </>
    )
  }
  const narrowed = query.q.trim() !== "" || query.kind !== null
  return (
    <>
      {top}
      <PageBody>
        <FilesToolbar count={loaded ? fileCountText(rows.length, list.prompts.length, narrowed, "prompt") : null}>
          <SearchField label="Search prompts" value={query.q} onChange={(q) => setQuery({ ...query, q }, true)} />
          <KindFilter
            checked={checked}
            counts={counts}
            onChange={(next) => {
              setBoth(next.length === KINDS.length)
              setQuery({ ...query, kind: kindOfChecked(next) })
            }}
          />
        </FilesToolbar>
        {loaded && rows.length === 0 ? (
          <NoFileMatch
            title="No prompt matches"
            clear={() => {
              setBoth(false)
              setQuery({ q: "", kind: null })
            }}
          />
        ) : (
          <PromptsGrid rows={rows} isLoading={!loaded} />
        )}
      </PageBody>
    </>
  )
}
