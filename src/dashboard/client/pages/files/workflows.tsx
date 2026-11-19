import { CircleCheckIcon, FileTextIcon, FolderIcon, ServerIcon, StarIcon } from "lucide-react"
import { type ReactNode, useCallback, useMemo } from "react"

import { Dash } from "@/components/file-page"
import { type FieldOptions, type FileColumns, FileListPage } from "@/components/file-list"
import { NameCell, Wrapped } from "@/components/files-table"
import { cellSkeleton, HEADER_END, SORT_HEADER } from "@/components/list-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { useLabel, usePrompts, useWorkflows } from "@/data/queries"
import {
  byFile,
  compareText,
  fileValue,
  GLOBAL,
  promptsByWorkflow,
  STATUS_VALUE_LABEL,
  WORKFLOW_FIELDS,
  type WorkflowRow,
  workflowValues,
} from "@/lib/files"
import { fieldValues, NONE } from "@/lib/list-filter"
import { to } from "@/lib/routes"

type Field = (typeof WORKFLOW_FIELDS)[number]

const FIELD_LABEL: Record<Field, string> = {
  applies: "Applies to",
  runsOn: "Runs on",
  default: "Default",
  usesPrompt: "Uses prompt",
  status: "Status",
}

const FIELD_ICON: Record<Field, ReactNode> = {
  applies: <FolderIcon aria-hidden="true" />,
  runsOn: <ServerIcon aria-hidden="true" />,
  default: <StarIcon aria-hidden="true" />,
  usesPrompt: <FileTextIcon aria-hidden="true" />,
  status: <CircleCheckIcon aria-hidden="true" />,
}

/** The name column, then Steps and Runs on. */
const columns = (): FileColumns<WorkflowRow> => ({
  lead: [
    {
      id: "name",
      accessorFn: (row) => row.name,
      header: ({ column }) => <DataGridColumnHeader title="Workflow" column={column} className={SORT_HEADER} />,
      cell: ({ row }) => (
        <NameCell
          href={to.file("workflows", row.original.project, row.original.name)}
          name={row.original.name}
          description={row.original.description}
          isDefault={row.original.default}
        />
      ),
      sortFn: (a, b) => byFile(a.original, b.original),
      // The least: the column takes the room the others leave, and the grid scrolls sideways only under it.
      size: 200,
      minSize: 200,
      enableSorting: true,
      meta: { autoSize: true, skeleton: cellSkeleton("w-48") },
    },
  ],
  extra: [
    {
      id: "steps",
      accessorFn: (row) => row.steps,
      header: ({ column }) => <DataGridColumnHeader title="Steps" column={column} className={SORT_HEADER} />,
      cell: ({ row }) => (row.original.steps === null ? <Dash /> : row.original.steps),
      // A workflow without steps after every count.
      sortFn: ({ original: { steps: a } }, { original: { steps: b } }) =>
        a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b,
      size: 80,
      enableSorting: true,
      meta: {
        headerClassName: HEADER_END,
        cellClassName: "text-right tabular-nums",
        skeleton: cellSkeleton("ms-auto w-8"),
      },
    },
    {
      id: "runsOn",
      accessorFn: (row) => row.runsOn,
      header: ({ column }) => <DataGridColumnHeader title="Runs on" column={column} className={SORT_HEADER} />,
      cell: ({ row }) => (row.original.runsOn === null ? <Dash /> : <Wrapped>{row.original.runsOn}</Wrapped>),
      sortFn: (a, b) => compareText(a.original.runsOn, b.original.runsOn),
      size: 100,
      enableSorting: true,
      meta: { skeleton: cellSkeleton("w-16") },
    },
  ],
})

/** `#/workflows`: every workflow file of the home, the global ones and each project's own. */
export function WorkflowsPage() {
  const workflows = useWorkflows()
  const prompts = usePrompts()
  const label = useLabel()
  const promptRows = prompts.data?.prompts
  const uses = useMemo(() => promptsByWorkflow(promptRows ?? []), [promptRows])
  const valuesOf = useCallback((row: WorkflowRow, field: string) => workflowValues(row, field, uses), [uses])
  const options = useCallback(
    (all: readonly WorkflowRow[]): FieldOptions<Field> => {
      const promptLabel = new Map(
        (promptRows ?? []).map((p) => [
          fileValue(p.name, p.project),
          p.project === null ? p.name : `${p.name} · ${label(p.project)}`,
        ]),
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
      return {
        values: (field) => fixed[field] ?? fieldValues(all, field, valuesOf, (v) => valueLabel(field, v)),
        label: valueLabel,
      }
    },
    [promptRows, label, valuesOf],
  )
  const data = workflows.data
  const list = useMemo(() => (data === undefined ? undefined : { rows: data.workflows, folder: data.folder }), [data])
  return (
    <FileListPage
      kind="workflows"
      query={workflows}
      list={list}
      fields={WORKFLOW_FIELDS}
      valuesOf={valuesOf}
      options={options}
      fieldLabel={FIELD_LABEL}
      fieldIcon={FIELD_ICON}
      columns={columns}
      noun="workflow"
      nouns="workflows"
      searchLabel="Search workflows"
      emptyTitle="No workflow yet"
      fileType="YAML"
    />
  )
}
