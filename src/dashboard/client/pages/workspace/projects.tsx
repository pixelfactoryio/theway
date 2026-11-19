import type { ColumnDef, ColumnSizingState, ExpandedState, Updater } from "@tanstack/react-table"
import { cn } from "cn"
import { ArrowUpRightIcon, FolderIcon, MoreHorizontalIcon, PlusIcon, StarIcon } from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"
import { Link, useLocation } from "wouter"

import { BandGrid } from "@/components/band-grid"
import { EmptyNote } from "@/components/empty-note"
import { type BarField, FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { useCollapsed } from "@/components/group-band"
import { ColumnLabel } from "@/components/list-grid"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid"
import { Input } from "@/components/ui/input"
import { HeadLink, HeadToggle, RowHead, ScrollBody, useProjectsGate } from "@/components/workspace-rows"
import { DIALOG_TITLE } from "@/components/ui-classes"
import { useChangeLists, useLabel, useSettings, useWrites } from "@/data/queries"
import { useBelowSm } from "@/hooks/use-below-sm"
import { isNarrowed, NO_FILTER, NONE, passesAll, valueCounts } from "@/lib/list-filter"
import { to } from "@/lib/routes"
import {
  allEntries,
  countOf,
  type Entry,
  inProgress,
  latest,
  PROJECT_FIELDS,
  type ProjectRow,
  projectTree,
  projectValues,
  renamed,
  suggestions,
  toDoOf,
  togglePin,
  ungrouped,
  withGroup,
  withoutProject,
  withProjectIn,
} from "@/lib/workspace"
import { PageBody, PageHeader } from "@/shell/top-bar"

/** A dialog asking for a group's name: `initial` filled in; `onName` with the trimmed name. */
function NameDialog({
  open,
  title,
  initial,
  onOpenChange,
  onName,
}: {
  open: boolean
  title: string
  initial: string
  onOpenChange: (open: boolean) => void
  onName: (name: string) => void
}) {
  // Mounted afresh for each request (its `key`), so the field starts from `initial`.
  const [name, setName] = useState(initial)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() === "") return
    onName(name.trim())
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className={DIALOG_TITLE}>{title}</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="Group name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={name.trim() === ""}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A pending name request: a new group of `keys`, or renaming group `id`. */
type Naming = { kind: "new"; keys: string[] } | { kind: "rename"; id: string; name: string } | null

/** All projects' count columns: right-aligned, in mono. */
const RIGHT = "text-right"
const COUNT = "text-right font-mono text-xs text-muted-foreground tabular-nums"

/** The name column's width, lowered below `sm`, where the count columns hide so the list fits a 390px screen. */
const NAME = { wide: 240, narrow: 160 } as const
const NO_COUNTS = { inProgress: false, toDo: false, lastArchived: false } as const

/** The expanded state `next` (or its updater) asks, from `current`, as a list of open rows. */
const nextExpanded = (next: Updater<ExpandedState>, current: Record<string, boolean>): ExpandedState =>
  typeof next === "function" ? next(current) : next

const PROJECT_FIELD_LABEL: Record<(typeof PROJECT_FIELDS)[number], string> = { group: "Group", pinned: "Pinned" }

/**
 * `#/projects`: every group and every project in none, the most recently archived first, one line each. A group is a
 * row that opens to its projects, indented beneath it, as a series does on Now; this browser remembers which are open.
 */
export function ProjectsPage() {
  const { projects, gate } = useProjectsGate()
  const list = useMemo(() => projects ?? [], [projects])
  const settings = useSettings()
  const edit = useWrites().editSettings
  const { lists } = useChangeLists(list.map((p) => p.key))
  const [filter, setFilter] = useListFilter("projects", PROJECT_FIELDS)
  const choices = useCollapsed("projects")
  const [sizing, setSizing] = useState<ColumnSizingState>({})
  const narrow = useBelowSm()
  const [, navigate] = useLocation()
  const [naming, setNaming] = useState<Naming>(null)
  const [error, setError] = useState<string | null>(null)
  const save = (f: Parameters<typeof edit>[0]) => {
    setError(null)
    edit(f).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  const label = useLabel()
  const valuesOf = (key: string, field: string) => projectValues(settings, key, field)
  const byLatest = (a: string, b: string) =>
    latest(lists, [b]).localeCompare(latest(lists, [a])) || label(a).localeCompare(label(b))
  const needle = filter.q.trim().toLowerCase()
  const holds = (text: string) => text.toLowerCase().includes(needle)
  // Each entry with the projects the search keeps: a group's matching projects, or all of them when its name matches.
  const searched = allEntries(list, settings).map((e) => ({
    e,
    keys: needle === "" || holds(e.label) ? e.keys : e.keys.filter((k) => holds(label(k))),
  }))
  const searchedKeys = searched.flatMap(({ keys }) => keys)
  // Then the projects the filters keep; an entry with none left is not listed.
  const entries = searched
    .map(({ e, keys }) => ({ e, keys: keys.filter((k) => passesAll(k, filter.rules, valuesOf)).sort(byLatest) }))
    .filter(({ keys }) => keys.length > 0)
    .sort(
      (a, b) => latest(lists, b.e.keys).localeCompare(latest(lists, a.e.keys)) || a.e.label.localeCompare(b.e.label),
    )
  const suggested = suggestions(list, settings)
  const shown = entries.reduce((n, { keys }) => n + keys.length, 0)
  const fields: BarField[] = PROJECT_FIELDS.map((id) => ({
    id,
    label: PROJECT_FIELD_LABEL[id],
    icon: id === "group" ? <FolderIcon aria-hidden="true" /> : <StarIcon aria-hidden="true" />,
    options:
      id === "group"
        ? [
            ...[...settings.groups]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((g) => ({ value: g.id, label: g.name })),
            { value: NONE, label: "Not in a group" },
          ]
        : [
            { value: "yes", label: "Pinned" },
            { value: "no", label: "Not pinned" },
          ],
    counts: valueCounts(searchedKeys, id, filter.rules, valuesOf),
  }))
  // While the list is narrowed, a group the user has not closed shows the projects it keeps.
  const narrowed = isNarrowed(filter)

  const menu = (e: Entry, key: string | null) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`${key !== null ? label(key) : e.label} actions`} />}
      >
        <MoreHorizontalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {e.kind === "group" && key === null ? (
          <>
            <DropdownMenuItem
              onClick={() => setNaming({ kind: "rename", id: e.id.slice("group:".length), name: e.label })}
            >
              Rename group…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => save((s) => ungrouped(s, e.id.slice("group:".length)))}>
              Ungroup
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Add to group</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {settings.groups.map((g) => (
                  <DropdownMenuItem
                    key={g.id}
                    disabled={key !== null && g.projects.includes(key)}
                    onClick={() => key !== null && save((s) => withProjectIn(s, g.id, key))}
                  >
                    {g.name}
                  </DropdownMenuItem>
                ))}
                {settings.groups.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem onClick={() => key !== null && setNaming({ kind: "new", keys: [key] })}>
                  <PlusIcon aria-hidden="true" />
                  New group…
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {e.kind === "group" && key !== null ? (
              <DropdownMenuItem onClick={() => save((s) => withoutProject(s, key))}>Remove from group</DropdownMenuItem>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const pin = (e: Entry) => {
    const pinned = settings.pinned.includes(e.id)
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${e.label}` : `Pin ${e.label}`}
        onClick={() => save((s) => togglePin(s, e.id))}
        className={pinned ? "text-foreground" : "text-muted-foreground"}
      >
        <StarIcon aria-hidden="true" className={cn(pinned && "fill-current")} />
      </Button>
    )
  }

  const rows = projectTree(entries)
  const groupIds = rows.filter((r) => r.key === null).map((r) => r.id)
  // A group opens as this browser last chose, else by default only while the list is narrowed.
  const expanded = Object.fromEntries(groupIds.map((id) => [id, !choices.collapsed(id, !narrowed)]))
  const onExpandedChange = (update: Updater<ExpandedState>) => {
    const next = nextExpanded(update, expanded)
    const isOpen = (id: string) => next === true || next[id] === true
    for (const id of groupIds) if (isOpen(id) !== expanded[id]) choices.set([id], !isOpen(id))
  }

  /** The columns: the head, In progress (amber while any), To do, Last archived, then the row's actions. */
  const columns: ColumnDef<DataGridFeatures, ProjectRow>[] = [
    {
      id: "project",
      header: () => <ColumnLabel>Project</ColumnLabel>,
      cell: ({ row }) => {
        const r = row.original
        if (r.key === null)
          return (
            <HeadToggle
              open={row.getIsExpanded()}
              onToggle={() => row.toggleExpanded()}
              head={(lead) => <RowHead lead={lead} id={r.entry.label} text={countOf(r.keys.length, "project")} />}
            />
          )
        const member = row.depth === 1
        return (
          <HeadLink href={to.project(r.key)} member={member}>
            <RowHead id={label(r.key)} text={list.find((p) => p.key === r.key)?.path ?? undefined} member={member} />
          </HeadLink>
        )
      },
      size: narrow ? NAME.narrow : NAME.wide,
      ...(narrow ? { minSize: NAME.narrow } : {}),
      enableSorting: false,
      meta: { fillWidth: true, cellClassName: "relative" },
    },
    {
      id: "inProgress",
      header: () => <ColumnLabel>In progress</ColumnLabel>,
      cell: ({ row }) => {
        const n = inProgress(lists, row.original.keys)
        return <span className={cn(n > 0 && "text-warning")}>{n}</span>
      },
      size: 96,
      enableSorting: false,
      meta: { headerClassName: RIGHT, cellClassName: COUNT },
    },
    {
      id: "toDo",
      header: () => <ColumnLabel>To do</ColumnLabel>,
      cell: ({ row }) => toDoOf(lists, row.original.keys),
      size: 80,
      enableSorting: false,
      meta: { headerClassName: RIGHT, cellClassName: COUNT },
    },
    {
      id: "lastArchived",
      header: () => <ColumnLabel>Last archived</ColumnLabel>,
      cell: ({ row }) => latest(lists, row.original.keys) || "–",
      size: 112,
      enableSorting: false,
      meta: { headerClassName: RIGHT, cellClassName: COUNT },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const r = row.original
        // The actions act alone: a click anywhere in their cell, gutter included, never reaches the row's.
        return (
          <span className="absolute inset-0 flex items-center justify-end pe-6" onClick={(e) => e.stopPropagation()}>
            {r.key === null ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Open ${r.entry.label}`}
                  className="text-muted-foreground"
                  render={<Link href={r.entry.href} />}
                >
                  <ArrowUpRightIcon aria-hidden="true" />
                </Button>
                {pin(r.entry)}
                {menu(r.entry, null)}
              </>
            ) : (
              <>
                {r.entry.kind === "project" ? pin(r.entry) : null}
                {menu(r.entry, r.key)}
              </>
            )}
          </span>
        )
      },
      size: 108,
      enableSorting: false,
      // The cell's content covers it whole, so its click stops there; the three buttons of a group fill it inside the
      // content's 24px right gutter.
      meta: { cellClassName: "relative p-0" },
    },
  ]

  return (
    <>
      <PageHeader title="All projects" />
      <PageBody>
        <FilterBar
          fields={fields}
          filter={filter}
          onChange={setFilter}
          searchLabel="Search projects"
          shown={projects !== null ? shown : null}
          total={projects !== null ? list.length : null}
          noun="project"
        />
        {error !== null ? (
          <EmptyNote tone="error" inset="page">
            Could not save: {error}
          </EmptyNote>
        ) : null}
        {suggested.map((s) => (
          <div
            key={s.key}
            className="mx-6 mb-3 flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm"
          >
            <span className="text-muted-foreground">
              Group{" "}
              {s.keys.map((k, i) => (
                <span key={k}>
                  {i > 0 ? (i === s.keys.length - 1 ? " and " : ", ") : null}
                  <span className="font-medium text-foreground">{label(k)}</span>
                </span>
              ))}
              ? Their names share “{s.name}”.
            </span>
            <span className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => save((now) => withGroup(now, s.name, s.keys))}>
                Group
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => save((now) => ({ ...now, dismissed: [...now.dismissed, s.key] }))}
              >
                Dismiss
              </Button>
            </span>
          </div>
        ))}
        <ScrollBody>
          {gate}
          {projects !== null && entries.length === 0 && narrowed ? (
            <NoMatch nouns="projects" filter={filter} fields={fields} onClear={() => setFilter(NO_FILTER)} />
          ) : null}
          {rows.length > 0 ? (
            <div className="pb-8">
              <BandGrid
                rows={rows}
                columns={columns}
                getRowId={(r) => r.id}
                getSubRows={(r) => r.subRows}
                columnSizing={sizing}
                onColumnSizingChange={setSizing}
                expanded={expanded}
                onExpandedChange={onExpandedChange}
                columnVisibility={narrow ? NO_COUNTS : undefined}
                onRowClick={(row) => {
                  const key = row.original.key
                  if (key === null) row.toggleExpanded()
                  else navigate(to.project(key))
                }}
                label="Projects"
                stickyHeader
              />
            </div>
          ) : null}
        </ScrollBody>
      </PageBody>
      <NameDialog
        key={
          naming === null ? "none" : naming.kind === "rename" ? `rename:${naming.id}` : `new:${naming.keys.join("|")}`
        }
        open={naming !== null}
        title={naming?.kind === "rename" ? "Rename group" : "New group"}
        initial={naming?.kind === "rename" ? naming.name : ""}
        onOpenChange={(o) => {
          if (!o) setNaming(null)
        }}
        onName={(name) => {
          const n = naming
          if (n === null) return
          save((s) => (n.kind === "rename" ? renamed(s, n.id, name) : withGroup(s, name, n.keys)))
        }}
      />
    </>
  )
}
