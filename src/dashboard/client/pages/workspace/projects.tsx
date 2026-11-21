import { cn } from "cn"
import {
  ArrowUpRightIcon,
  FolderIcon,
  FoldersIcon,
  LayoutGridIcon,
  MoreHorizontalIcon,
  PlusIcon,
  StarIcon,
} from "lucide-react"
import { type FormEvent, type ReactNode, useMemo, useState } from "react"
import { useLocation } from "wouter"

import { EmptyNote } from "@/components/empty-note"
import { type BarField, FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { useCollapsed } from "@/components/group-band"
import { ListFoot } from "@/components/list-grid"
import { COLUMN, type ListColumn, ListHead, ListRow, ListRows, RowActions } from "@/components/list-kit"
import { PinButton } from "@/components/pin-button"
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
import { Input } from "@/components/ui/input"
import { ScrollBody, useProjectsGate } from "@/components/workspace-rows"
import { DIALOG_TITLE } from "@/components/ui-classes"
import { useChangeLists, useLabel, useSettings, useWrites } from "@/data/queries"
import { isNarrowed, NO_FILTER, NONE, passesAll, valueCounts } from "@/lib/list-filter"
import { to } from "@/lib/routes"
import {
  allEntries,
  countOf,
  type Entry,
  inProgress,
  latest,
  notStarted,
  PROJECT_FIELDS,
  projectTree,
  projectValues,
  renamed,
  suggestions,
  togglePin,
  ungrouped,
  withGroup,
  withoutProject,
  withProjectIn,
} from "@/lib/workspace"
import { ProjectMark } from "@/shell/project-mark"
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

/** All projects' columns: In progress, Not started and Last archived, then a row's actions. */
const COLUMNS: ListColumn[] = [
  { id: "inProgress", title: "In progress", className: COLUMN.count, align: "end" },
  { id: "notStarted", title: "Not started", className: COLUMN.count, align: "end" },
  { id: "lastArchived", title: "Last archived", className: COLUMN.count, align: "end" },
  { id: "actions", title: "", className: COLUMN.actions, align: "end" },
]

/** A count of All projects: the ink while there is any, the secondary ink at zero. */
const Count = ({ n }: { n: number }) => <span className={cn(n > 0 && "text-foreground")}>{n}</span>

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
            <DropdownMenuItem onClick={() => navigate(e.href)}>
              <ArrowUpRightIcon aria-hidden="true" />
              Open group
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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

  const pin = (e: Entry) => (
    <PinButton
      pinned={settings.pinned.includes(e.id)}
      label={e.label}
      onToggle={() => save((s) => togglePin(s, e.id))}
    />
  )

  const rows = projectTree(entries)
  // A group opens as this browser last chose, else by default only while the list is narrowed.
  const isOpen = (id: string) => !choices.collapsed(id, !narrowed)
  /**
   * A project's folder, after its name: plain `text-xs` (14px) secondary text, nothing when it is not known. It takes only the room
   * the name leaves (no basis, growing up to its own width), so the name is never cut for it.
   */
  const path = (key: string) => {
    const folder = list.find((p) => p.key === key)?.path ?? ""
    return folder.trim() === "" || folder === "/" ? undefined : (
      <span className="max-w-max min-w-0 grow basis-0 truncate text-xs text-muted-foreground">{folder}</span>
    )
  }
  const cells = (keys: readonly string[], actions: ReactNode) =>
    COLUMNS.map((column) => ({
      column,
      content:
        column.id === "inProgress" ? (
          <Count n={inProgress(lists, keys)} />
        ) : column.id === "notStarted" ? (
          <Count n={notStarted(lists, keys)} />
        ) : column.id === "lastArchived" ? (
          latest(lists, keys) || "–"
        ) : (
          <RowActions>{actions}</RowActions>
        ),
    }))

  return (
    <>
      <PageHeader title="All projects" icon={LayoutGridIcon} />
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
        {error !== null ? <EmptyNote tone="error">Could not save: {error}</EmptyNote> : null}
        {suggested.map((s) => (
          <div key={s.key} role="note" className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
            <FoldersIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-muted-foreground">
              Group{" "}
              {s.keys.map((k, i) => (
                <span key={k}>
                  {i > 0 ? (i === s.keys.length - 1 ? " and " : ", ") : null}
                  <span className="text-foreground">{label(k)}</span>
                </span>
              ))}
              ? Their names share “{s.name}”.
            </span>
            <span className="flex shrink-0 gap-2">
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
            <>
              <ListHead name="Project" columns={COLUMNS} />
              <ListRows label="Projects">
                {rows.map((r) => {
                  if (r.key !== null)
                    return (
                      <ListRow
                        key={r.id}
                        head={{ href: to.project(r.key) }}
                        icon={<ProjectMark label={label(r.key)} />}
                        meta={path(r.key)}
                        cells={cells(r.keys, [
                          ...(r.entry.kind === "project" ? [<span key="pin">{pin(r.entry)}</span>] : []),
                          <span key="menu">{menu(r.entry, r.key)}</span>,
                        ])}
                      >
                        {label(r.key)}
                      </ListRow>
                    )
                  const open = isOpen(r.id)
                  return [
                    <ListRow
                      key={r.id}
                      head={{ onToggle: () => choices.set([r.id], open), expanded: open }}
                      icon={<ProjectMark label={r.entry.label} group />}
                      meta={
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {countOf(r.keys.length, "project")}
                        </span>
                      }
                      cells={cells(r.keys, [
                        <span key="pin">{pin(r.entry)}</span>,
                        <span key="menu">{menu(r.entry, null)}</span>,
                      ])}
                    >
                      {r.entry.label}
                    </ListRow>,
                    ...(open
                      ? r.subRows.map((m) => (
                          <ListRow
                            key={m.id}
                            member
                            head={{ href: to.project(m.key as string) }}
                            icon={<FolderIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
                            meta={path(m.key as string)}
                            cells={cells(m.keys, <span>{menu(m.entry, m.key)}</span>)}
                          >
                            {label(m.key as string)}
                          </ListRow>
                        ))
                      : []),
                  ]
                })}
              </ListRows>
              <ListFoot />
            </>
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
