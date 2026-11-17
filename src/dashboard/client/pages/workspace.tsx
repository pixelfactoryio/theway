import { cn } from "cn"
import { ChevronRightIcon, MoreHorizontalIcon, PlusIcon, SearchIcon, StarIcon } from "lucide-react"
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react"
import { Link } from "wouter"

import { PageHeader } from "@/components/doc-frame"
import { StatusMark } from "@/components/status"
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
import {
  type ActiveChange,
  type ActiveRow,
  type ActiveStatus,
  activeRows,
  type ArchivedChange,
  ageOf,
  type ChangeList,
  rowStatus,
  type SeriesRow,
} from "@/lib/changes"
import { changePath, type Project } from "@/lib/projects"
import {
  allEntries,
  type Entry,
  entryOf,
  renamed,
  suggestions,
  toDo,
  togglePin,
  ungrouped,
  withGroup,
  withoutProject,
  withProjectIn,
} from "@/lib/workspace"
import { useChangesOf } from "@/shell/changes"
import { LoadError } from "@/shell/load-error"
import { useProjects } from "@/shell/projects"
import { recordedId, useEditSettings, useRecordVisit, useSettings } from "@/shell/settings"
import { PageBody } from "@/shell/top-bar"

/** The time now, refreshed every minute, for the rows' ages. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** Each project's change list, by key, once loaded; the keys still loading or failed left out. */
function useListsOf(keys: readonly string[]): { lists: Map<string, ChangeList>; pending: boolean; failed: string[] } {
  const results = useChangesOf(keys)
  const lists = new Map<string, ChangeList>()
  const failed: string[] = []
  results.forEach((r, i) => {
    const key = keys[i] as string
    if (r.data !== undefined) lists.set(key, r.data)
    else if (r.isError) failed.push(key)
  })
  return { lists, pending: results.some((r) => r.isPending), failed }
}

/** The progress bar and `done/total`. */
function Progress({ done, total }: { done: number; total: number }) {
  const ratio = total === 0 ? 0 : done / total
  return (
    <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
      <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-accent">
        <span className="absolute inset-y-0 left-0 rounded-full bg-warning" style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="w-10 text-right">
        {done}/{total}
      </span>
    </span>
  )
}

/** A change's row: its description (its ID when none) over its ID, its project when `project`, progress and age. */
function ChangeRow({
  projectKey,
  change,
  project,
  now,
  member = false,
}: {
  projectKey: string
  change: ActiveChange
  project?: string
  now: number
  /** A member listed under its series row: indented. */
  member?: boolean
}) {
  return (
    <li data-nav-item="">
      <Link
        href={changePath(projectKey, change.id)}
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_10rem_2.75rem] items-center gap-4 border-b py-2 pr-3",
          member ? "pl-9" : "pl-3",
          "outline-none hover:bg-accent/50 focus-visible:bg-accent md:grid-cols-[minmax(0,1fr)_9.375rem_10rem_2.75rem]",
        )}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm text-foreground">{change.description ?? change.id}</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">{change.id}</span>
        </span>
        {project !== undefined ? (
          <span className="hidden truncate text-xs text-muted-foreground md:block">{project}</span>
        ) : (
          <span className="hidden md:block" />
        )}
        <Progress done={change.done} total={change.total} />
        <span className="text-right text-xs text-muted-foreground tabular-nums">{ageOf(change.updated, now)}</span>
      </Link>
    </li>
  )
}

/** A titled group of rows: its status mark, its title and its count, then its list. */
function Section({
  mark,
  title,
  count,
  children,
}: {
  mark: ReactNode
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <section className="mt-5 first:mt-0">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        {mark}
        {title}
        <span className="font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  )
}

/**
 * A series' row: the description of its next member not Ready (its ID when none), the series ID and its number of
 * changes, its summed progress and latest age; it opens to list its members.
 */
function SeriesRowItem({
  projectKey,
  row,
  project,
  now,
}: {
  projectKey: string
  row: SeriesRow
  project?: string
  now: number
}) {
  const [open, setOpen] = useState(false)
  const next = row.children.find((c) => c.change.status !== "ready") ?? row.children[0]
  const title = next?.change.description ?? row.id
  return (
    <li>
      <button
        type="button"
        data-nav-item=""
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[minmax(0,1fr)_10rem_2.75rem] items-center gap-4 border-b px-3 py-2 text-left outline-none hover:bg-accent/50 focus-visible:bg-accent md:grid-cols-[minmax(0,1fr)_9.375rem_10rem_2.75rem]"
      >
        <span className="flex min-w-0 items-start gap-2">
          <ChevronRightIcon
            aria-hidden="true"
            className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm text-foreground">{title}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {row.id} · series of {row.count}
            </span>
          </span>
        </span>
        {project !== undefined ? (
          <span className="hidden truncate text-xs text-muted-foreground md:block">{project}</span>
        ) : (
          <span className="hidden md:block" />
        )}
        {row.progress !== null ? <Progress done={row.progress.done} total={row.progress.total} /> : <span />}
        <span className="text-right text-xs text-muted-foreground tabular-nums">{ageOf(row.updated, now)}</span>
      </button>
      {open ? (
        <ul>
          {row.children.map((c) => (
            <ChangeRow key={c.id} projectKey={projectKey} change={c.change} project={project} now={now} member />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** One row of a project's open changes, a change or a series, with the project's key and label. */
type Located = { key: string; label: string; row: ActiveRow }

/** The rows of `lists` (a series of two or more as one row) with status `status`, the most recently updated first. */
function located(
  lists: Map<string, ChangeList>,
  projects: readonly Project[],
  status: ActiveStatus,
  q: string,
): Located[] {
  const updated = (r: ActiveRow) => (r.kind === "series" ? r.updated : r.change.updated)
  return projects
    .flatMap((p) =>
      activeRows(lists.get(p.key)?.active ?? [], q, [])
        .filter((row) => rowStatus(row) === status)
        .map((row) => ({ key: p.key, label: p.label, row })),
    )
    .sort((a, b) => updated(b.row).localeCompare(updated(a.row)))
}

/** The Ready changes to archive: alone, or in a series that is Ready as a whole (the others wait for their series). */
const readyCount = (active: readonly ActiveChange[]): number =>
  activeRows(active, "", [])
    .filter((r) => rowStatus(r) === "ready")
    .reduce((n, r) => n + (r.kind === "series" ? r.children.length : 1), 0)

/** The open changes of `projects`, by status: invalid, In progress, Not started, then Ready to archive as counts. */
function OpenChanges({
  projects,
  lists,
  showProject,
  empty,
  readyRows = false,
  q = "",
}: {
  projects: readonly Project[]
  lists: Map<string, ChangeList>
  showProject: boolean
  empty: ReactNode
  /** Ready to archive listed as rows (a project's page) rather than as a count per project (Now). */
  readyRows?: boolean
  /** Only the changes whose ID or description holds it. */
  q?: string
}) {
  const now = useNow()
  const statuses = readyRows
    ? (["invalid", "in-progress", "not-started", "ready"] as const)
    : (["invalid", "in-progress", "not-started"] as const)
  const groups = statuses
    .map((status) => ({ status, rows: located(lists, projects, status, q) }))
    .filter((g) => g.rows.length > 0)
  const ready = readyRows
    ? []
    : projects.map((p) => ({ p, n: readyCount(lists.get(p.key)?.active ?? []) })).filter((r) => r.n > 0)
  const TITLE = {
    invalid: "Needs fixing",
    "in-progress": "In progress",
    "not-started": "Not started",
    ready: "Ready to archive",
  } as const
  if (groups.length === 0 && ready.length === 0) return <>{empty}</>
  return (
    <>
      {groups.map((g) => (
        <Section key={g.status} mark={<StatusMark status={g.status} />} title={TITLE[g.status]} count={g.rows.length}>
          <ul data-nav-list="">
            {g.rows.map((r) =>
              r.row.kind === "series" ? (
                <SeriesRowItem
                  key={`${r.key}/${r.row.id}`}
                  projectKey={r.key}
                  row={r.row}
                  project={showProject ? r.label : undefined}
                  now={now}
                />
              ) : (
                <ChangeRow
                  key={`${r.key}/${r.row.id}`}
                  projectKey={r.key}
                  change={r.row.change}
                  project={showProject ? r.label : undefined}
                  now={now}
                />
              ),
            )}
          </ul>
        </Section>
      ))}
      {ready.length > 0 ? (
        <Section
          mark={<StatusMark status="ready" />}
          title="Ready to archive"
          count={ready.reduce((n, r) => n + r.n, 0)}
        >
          <div className="mt-2 flex flex-wrap gap-2">
            {ready.map(({ p, n }) => (
              <Link
                key={p.key}
                href={`/${p.key}?`}
                className="rounded-md border px-3 py-1 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                {p.label}
                <span className="ml-2 font-medium text-success tabular-nums">{n}</span>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  )
}

/** A page's filter field, in its top row. */
function FilterField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex h-7 w-60 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
      <SearchIcon aria-hidden="true" className="size-3.5" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  )
}

/** A page's scrolling body, at most 1040px wide. */
function Body({ children }: { children: ReactNode }) {
  return (
    <PageBody>
      <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-[65rem] px-7 py-5">{children}</div>
      </div>
    </PageBody>
  )
}

/** What a page shows while the projects load or after they failed: `null` once they are known. */
function useProjectsGate(): { projects: Project[] | null; gate: ReactNode } {
  const query = useProjects()
  if (query.isError)
    return {
      projects: null,
      gate: (
        <LoadError what="the projects" error={query.error} retry={() => void query.refetch()} className="m-4 w-auto" />
      ),
    }
  return { projects: query.data?.projects ?? null, gate: null }
}

/** `#/`: every project's changes in focus order: needs fixing, In progress, Not started, Ready to archive counted. */
export function NowPage() {
  const { projects, gate } = useProjectsGate()
  const list = projects ?? []
  const { lists, failed } = useListsOf(list.map((p) => p.key))
  return (
    <>
      <PageHeader title="Now" detail={projects !== null ? `across ${list.length} projects` : undefined} />
      <Body>
        {gate}
        {failed.length > 0 ? (
          <p className="mb-3 text-sm text-destructive">
            Could not load the changes of {failed.length} project{failed.length === 1 ? "" : "s"}.
          </p>
        ) : null}
        <OpenChanges
          projects={list}
          lists={lists}
          showProject
          empty={projects !== null ? <p className="text-sm text-muted-foreground">Nothing open.</p> : null}
        />
      </Body>
    </>
  )
}

/** The latest archive date among `archived` (newest first), `""` when none. */
const lastArchived = (archived: readonly ArchivedChange[] | undefined): string => archived?.[0]?.date ?? ""

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

/** `#/projects`: every group and project, the most recently archived first, with Pin and Group; the suggestions. */
export function ProjectsPage() {
  const { projects, gate } = useProjectsGate()
  const list = projects ?? []
  const settings = useSettings()
  const edit = useEditSettings()
  const { lists } = useListsOf(list.map((p) => p.key))
  const [q, setQ] = useState("")
  const [naming, setNaming] = useState<Naming>(null)
  const [error, setError] = useState<string | null>(null)
  const save = (f: Parameters<typeof edit>[0]) => {
    setError(null)
    edit(f).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  const label = (key: string) => list.find((p) => p.key === key)?.label ?? key
  const latest = (keys: readonly string[]) =>
    keys.map((k) => lastArchived(lists.get(k)?.archived)).reduce((a, b) => (a > b ? a : b), "")
  const inProgress = (keys: readonly string[]) =>
    keys.reduce((n, k) => n + (lists.get(k)?.active.filter((c) => c.status === "in-progress").length ?? 0), 0)
  const open = (keys: readonly string[]) => keys.reduce((n, k) => n + toDo(lists.get(k)), 0)
  const needle = q.trim().toLowerCase()
  const entries = useMemo(
    () =>
      allEntries(list, settings)
        .filter(
          (e) =>
            needle === "" ||
            e.label.toLowerCase().includes(needle) ||
            e.keys.some((k) => label(k).toLowerCase().includes(needle)),
        )
        .sort((a, b) => latest(b.keys).localeCompare(latest(a.keys)) || a.label.localeCompare(b.label)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, settings, lists, needle],
  )
  const suggested = suggestions(list, settings)
  const groupCount = settings.groups.length

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
        className={pinned ? "text-brand" : "text-muted-foreground"}
      >
        <StarIcon aria-hidden="true" className={cn(pinned && "fill-current")} />
      </Button>
    )
  }

  const GRID = "grid grid-cols-[1.75rem_minmax(0,1fr)_5.5rem_4.5rem_7rem_4rem] items-center gap-3 px-3"
  const counts = (keys: readonly string[]) => (
    <>
      <span className="font-mono text-xs tabular-nums">
        <span className={inProgress(keys) > 0 ? "text-warning" : "text-muted-foreground"}>{inProgress(keys)}</span>
      </span>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">{open(keys)}</span>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">{latest(keys) || "–"}</span>
    </>
  )

  return (
    <>
      <PageHeader
        title="All projects"
        detail={
          projects !== null
            ? `${list.length} repositories · ${groupCount} group${groupCount === 1 ? "" : "s"}`
            : undefined
        }
        actions={<FilterField value={q} onChange={setQ} label="Filter projects" />}
      />
      <Body>
        {gate}
        {error !== null ? <p className="mb-3 text-sm text-destructive">Could not save: {error}</p> : null}
        {suggested.map((s) => (
          <div key={s.key} className="mb-3 flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm">
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
        <div className={cn(GRID, "border-b py-2 text-xs text-muted-foreground")}>
          <span />
          <span>Project</span>
          <span>In progress</span>
          <span>Open</span>
          <span>Last archived</span>
          <span />
        </div>
        <ul data-nav-list="">
          {entries.map((e) => (
            <li key={e.id}>
              <div data-nav-item="" className={cn(GRID, "border-b py-2 hover:bg-accent/40")}>
                <span className="flex size-[22px] items-center justify-center rounded-md bg-accent text-xs font-semibold uppercase">
                  {e.label.slice(0, 1)}
                </span>
                <Link
                  href={e.href}
                  className="min-w-0 rounded-sm text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block truncate">{e.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {e.kind === "group"
                      ? `group · ${e.keys.length} repos`
                      : (list.find((p) => p.key === e.keys[0])?.path ?? "")}
                  </span>
                </Link>
                {counts(e.keys)}
                <span className="flex justify-end">
                  {pin(e)}
                  {menu(e, e.kind === "project" ? (e.keys[0] as string) : null)}
                </span>
              </div>
              {e.kind === "group"
                ? e.keys.map((k) => (
                    <div key={k} className={cn(GRID, "border-b py-2 hover:bg-accent/40")}>
                      <span />
                      <Link
                        href={`/${k}?`}
                        className="truncate pl-4 text-sm text-muted-foreground hover:text-foreground"
                      >
                        {label(k)}
                      </Link>
                      {counts([k])}
                      <span className="flex justify-end">{menu(e, k)}</span>
                    </div>
                  ))
                : null}
            </li>
          ))}
        </ul>
      </Body>
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

/** The month heading of an archive date `YYYY-MM-DD…`: "November 2026". */
const monthOf = (date: string): string => {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00`)
  return Number.isNaN(d.getTime())
    ? date.slice(0, 7)
    : d.toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

/** The archived changes of `keys`, newest first, grouped by month; the first `limit` unless all are asked for. */
function Archive({
  keys,
  lists,
  label,
  limit,
  allHref,
  q,
}: {
  keys: readonly string[]
  lists: Map<string, ChangeList>
  label: (k: string) => string
  limit: number | null
  allHref: string
  /** Only the archived changes whose ID holds it, ignoring case. */
  q: string
}) {
  const needle = q.trim().toLowerCase()
  const rows = keys
    .flatMap((k) => (lists.get(k)?.archived ?? []).map((a) => ({ key: k, a })))
    .filter(({ a }) => needle === "" || a.id.toLowerCase().includes(needle))
    .sort((x, y) => y.a.date.localeCompare(x.a.date))
  const shown = limit === null ? rows : rows.slice(0, limit)
  const months: { month: string; rows: typeof rows }[] = []
  for (const r of shown) {
    const m = monthOf(r.a.date)
    const last = months.at(-1)
    if (last?.month === m) last.rows.push(r)
    else months.push({ month: m, rows: [r] })
  }
  if (rows.length === 0)
    return <p className="mt-2 text-sm text-muted-foreground">{needle === "" ? "Nothing archived yet." : "No match."}</p>
  return (
    <>
      {months.map((m) => (
        <div key={m.month}>
          <h3 className="mt-4 mb-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.month}</h3>
          <ul data-nav-list="">
            {m.rows.map(({ key, a }) => (
              <li key={`${key}/${a.dir}`} data-nav-item="">
                <Link
                  href={`/${key}/changes/archive/${encodeURIComponent(a.dir)}?`}
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-3 border-b px-3 py-2 text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent"
                >
                  <span className="pt-px font-mono text-xs text-muted-foreground tabular-nums">
                    {a.date.slice(5, 10)}
                  </span>
                  <span className="truncate font-mono text-sm">{a.id}</span>
                  {keys.length > 1 ? <span className="text-xs text-muted-foreground">{label(key)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {limit !== null && rows.length > limit ? (
        <Link href={allHref} className="mt-3 inline-block px-3 text-sm text-link hover:underline">
          All {rows.length} archived →
        </Link>
      ) : null}
    </>
  )
}

/**
 * A project's or a group's page (`#/<key>`, `#/group/<id>`): its open changes by status, then its archive by month
 * (all of it with `?archive`). Opening it records it among the recently opened.
 */
export function ScopePage({ id, all }: { id: string; all: boolean }) {
  const { projects, gate } = useProjectsGate()
  const list = projects ?? []
  const settings = useSettings()
  const entry = projects !== null ? entryOf(id, list, settings) : null
  // A repo of a group is recorded as its group, which the sidebar lists.
  useRecordVisit(
    entry === null ? null : entry.kind === "project" ? recordedId(settings, entry.keys[0] as string) : entry.id,
  )
  const group =
    entry?.kind === "project" ? settings.groups.find((g) => g.projects.includes(entry.keys[0] as string)) : undefined
  const keys = entry?.keys ?? []
  const { lists } = useListsOf(keys)
  const scoped = list.filter((p) => keys.includes(p.key))
  const label = (k: string) => list.find((p) => p.key === k)?.label ?? k
  const archived = keys.reduce((n, k) => n + (lists.get(k)?.archived.length ?? 0), 0)
  const title = entry?.label ?? ""
  const [q, setQ] = useState("")
  const filtering = q.trim() !== ""
  return (
    <>
      <PageHeader
        title={title}
        parent={
          group !== undefined ? { label: group.name, href: `/group/${encodeURIComponent(group.id)}?` } : undefined
        }
        actions={entry !== null ? <FilterField value={q} onChange={setQ} label="Filter changes" /> : undefined}
        detail={
          entry !== null ? (
            <>
              {entry.kind === "group" ? `${keys.length} repos · ` : ""}
              {keys.reduce((n, k) => n + toDo(lists.get(k)), 0)} open · {archived} archived
            </>
          ) : undefined
        }
      />
      <Body>
        {gate}
        {projects !== null && entry === null ? (
          <p className="text-sm text-muted-foreground">This project or group no longer exists.</p>
        ) : null}
        {entry !== null && !all ? (
          <OpenChanges
            projects={scoped}
            lists={lists}
            showProject={entry.kind === "group"}
            readyRows
            q={q}
            empty={
              <p className="text-sm text-muted-foreground">{filtering ? "No open change matches." : "Nothing open."}</p>
            }
          />
        ) : null}
        {entry !== null ? (
          <section className={all ? "" : "mt-7"}>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <StatusMark status="archived" />
              {all ? "Archive" : "Recently archived"}
              <span className="font-normal text-muted-foreground tabular-nums">{archived}</span>
            </h2>
            <Archive
              keys={keys}
              lists={lists}
              label={label}
              limit={all || filtering ? null : 12}
              allHref={`${entry.href.replace(/\?$/, "")}?archive`}
              q={q}
            />
          </section>
        ) : null}
      </Body>
    </>
  )
}
