import { cn } from "cn"
import { ArrowUpRightIcon, FolderIcon, MoreHorizontalIcon, PlusIcon, StarIcon } from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"
import { Link } from "wouter"

import { EmptyNote } from "@/components/empty-note"
import { type BarField, FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { useCollapsed } from "@/components/group-band"
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
import { OpenRow, ROW_FRAME, ROW_MAIN, RowHead, ScrollBody, useProjectsGate } from "@/components/workspace-rows"
import { useChangeLists, useLabel, useSettings, useWrites } from "@/data/queries"
import { isNarrowed, NO_FILTER, NONE, passesAll, valueCounts } from "@/lib/list-filter"
import { to } from "@/lib/routes"
import {
  allEntries,
  countOf,
  type Entry,
  inProgress,
  latest,
  PROJECT_FIELDS,
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
            <DialogTitle>{title}</DialogTitle>
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

/** All projects' count columns, after the name and path: In progress, To do and Last archived, right-aligned. */
const COUNT = "shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums"
const IN_PROGRESS = "w-20"
const TO_DO = "w-14"
const LAST_ARCHIVED = "w-24"
/** The actions column: room for a group's three buttons (open, pin, menu), each row's aligned at its right. */
const ACTIONS = "flex w-21 shrink-0 items-center justify-end"

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

  /** The count columns of `keys`: In progress (amber while any), To do, Last archived. */
  const counts = (keys: readonly string[]) => (
    <>
      <span className={cn(COUNT, IN_PROGRESS, inProgress(lists, keys) > 0 && "text-warning")}>
        {inProgress(lists, keys)}
      </span>
      <span className={cn(COUNT, TO_DO)}>{toDoOf(lists, keys)}</span>
      <span className={cn(COUNT, LAST_ARCHIVED)}>{latest(lists, keys) || "–"}</span>
    </>
  )

  /** A project's row: its name then its path, its counts, then its pin (alone, not in a group) and its menu. */
  const projectRow = (e: Entry, key: string, member = false) => (
    <li key={key}>
      <div className={ROW_FRAME}>
        <Link href={to.project(key)} data-nav-item="" className={ROW_MAIN}>
          <RowHead id={label(key)} text={list.find((p) => p.key === key)?.path ?? undefined} member={member} />
          {counts([key])}
        </Link>
        <span className={ACTIONS}>
          {e.kind === "project" ? pin(e) : null}
          {menu(e, key)}
        </span>
      </div>
    </li>
  )

  /** A group's row: its name and its number of projects, its totals, then open its page, its pin and its menu. */
  const groupRow = (e: Entry, keys: string[]) => {
    const open = !choices.collapsed(e.id, !narrowed)
    return (
      <OpenRow
        key={e.id}
        open={open}
        onToggle={() => choices.set([e.id], open)}
        cells={(lead) => (
          <>
            <RowHead lead={lead} id={e.label} text={countOf(keys.length, "project")} />
            {counts(keys)}
          </>
        )}
        actions={
          <span className={ACTIONS}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Open ${e.label}`}
              className="text-muted-foreground"
              render={<Link href={e.href} />}
            >
              <ArrowUpRightIcon aria-hidden="true" />
            </Button>
            {pin(e)}
            {menu(e, null)}
          </span>
        }
      >
        {keys.map((k) => projectRow(e, k, true))}
      </OpenRow>
    )
  }

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
        <div
          aria-hidden="true"
          className="flex h-8 shrink-0 items-center gap-2 border-b px-6 text-xs text-muted-foreground"
        >
          <span className="min-w-0 flex-1">Project</span>
          <span className={cn("shrink-0 text-right", IN_PROGRESS)}>In progress</span>
          <span className={cn("shrink-0 text-right", TO_DO)}>To do</span>
          <span className={cn("shrink-0 text-right", LAST_ARCHIVED)}>Last archived</span>
          <span className="w-21 shrink-0" />
        </div>
        <ScrollBody>
          {gate}
          {projects !== null && entries.length === 0 && narrowed ? (
            <NoMatch nouns="projects" filter={filter} fields={fields} onClear={() => setFilter(NO_FILTER)} />
          ) : null}
          <ul data-nav-list="" className="pb-8">
            {entries.map(({ e, keys }) => (e.kind === "group" ? groupRow(e, keys) : projectRow(e, keys[0] as string)))}
          </ul>
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
