import { cn } from "cn"
import { CircleCheckIcon, CpuIcon, FolderIcon, ShapesIcon, WorkflowIcon } from "lucide-react"
import { type ReactNode, useCallback, useMemo } from "react"
import { Link } from "wouter"

import { Dash } from "@/components/file-page"
import { type FieldOptions, type FileColumns, FileListPage } from "@/components/file-list"
import { NameCell, WRAP, Wrapped } from "@/components/files-table"
import { cellSkeleton } from "@/components/list-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useLabel, usePrompts } from "@/data/queries"
import {
  byFile,
  compareText,
  describeUse,
  fileValue,
  GLOBAL,
  KIND_LABEL,
  kindOf,
  KINDS,
  PROMPT_FIELDS,
  type PromptKind,
  type PromptRow,
  promptValues,
  STATUS_VALUE_LABEL,
  type Use,
} from "@/lib/files"
import { fieldValues, NONE } from "@/lib/list-filter"
import { to } from "@/lib/routes"

type Field = (typeof PROMPT_FIELDS)[number]

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

const FIELD_LABEL: Record<Field, string> = {
  kind: "Kind",
  applies: "Applies to",
  model: "Model",
  usedBy: "Used by",
  status: "Status",
}

const FIELD_ICON: Record<Field, ReactNode> = {
  kind: <ShapesIcon aria-hidden="true" />,
  applies: <FolderIcon aria-hidden="true" />,
  model: <CpuIcon aria-hidden="true" />,
  usedBy: <WorkflowIcon aria-hidden="true" />,
  status: <CircleCheckIcon aria-hidden="true" />,
}

/** The name column, then Kind, Model and Used by. */
const columns = (): FileColumns<PromptRow> => ({
  lead: [
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
  ],
  extra: [
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
  ],
})

/** `#/prompts`: every prompt file of the home, the global ones and each project's own. */
export function PromptsPage() {
  const prompts = usePrompts()
  const label = useLabel()
  const options = useCallback(
    (all: readonly PromptRow[]): FieldOptions<Field> => {
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
      return {
        values: (field) =>
          field === "kind"
            ? [...KINDS]
            : field === "status"
              ? ["valid", "error"]
              : fieldValues(all, field, promptValues, (v) => valueLabel(field, v)),
        label: valueLabel,
      }
    },
    [label],
  )
  const data = prompts.data
  const list = useMemo(() => (data === undefined ? undefined : { rows: data.prompts, folder: data.folder }), [data])
  return (
    <FileListPage
      kind="prompts"
      query={prompts}
      list={list}
      fields={PROMPT_FIELDS}
      valuesOf={promptValues}
      options={options}
      fieldLabel={FIELD_LABEL}
      fieldIcon={FIELD_ICON}
      columns={columns}
      noun="prompt"
      nouns="prompts"
      searchLabel="Search prompts"
      emptyTitle="No prompt yet"
      fileType="Markdown"
    />
  )
}
