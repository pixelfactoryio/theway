import { cn } from "cn"
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleDotIcon,
  FolderIcon,
  MoreHorizontalIcon,
  PlusIcon,
  StarIcon,
} from "lucide-react"
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react"
import { Link } from "wouter"

import { PageHeader } from "@/components/doc-frame"
import { type BarField, FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { CollapseHint, GroupBand, useCollapsed } from "@/components/group-band"
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
  changeCount,
  type ChangeList,
  rowStatus,
  type SeriesRow,
  type Status,
} from "@/lib/changes"
import { monthGroup } from "@/lib/collapse"
import { fileMatches } from "@/lib/files"
import { isNarrowed, NO_FILTER, NONE, passesAll, picks, valueCounts } from "@/lib/list-filter"
import { archivePath, changePath, type Project, projectPath } from "@/lib/projects"
import {
  allEntries,
  countOf,
  type Entry,
  entryOf,
  renamed,
  suggestions,
  toDo,
  togglePin,
  PROJECT_FIELDS,
  projectValues,
  ungrouped,
  withGroup,
  withoutProject,
  withProjectIn,
} from "@/lib/workspace"
import { useChangesOf } from "@/shell/changes"
import { useLabel } from "@/shell/files"
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

/** The progress bar, 96px, and `done/total` in a 56px column: red while invalid, green once every task is done. */
function Progress({ done, total, status }: { done: number; total: number; status: ActiveStatus }) {
  const ratio = total === 0 ? 0 : done / total
  return (
    <>
      <span className="relative hidden h-1 w-24 shrink-0 overflow-hidden rounded-full bg-border sm:block">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            status === "invalid" ? "bg-destructive" : total > 0 && done === total ? "bg-success" : "bg-warning",
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span className="w-14 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
        {done}/{total}
      </span>
    </>
  )
}

/** The progress columns of a row with none: as wide as `Progress`, empty. */
function NoProgress() {
  return (
    <>
      <span className="hidden w-24 shrink-0 sm:block" />
      <span className="w-14 shrink-0" />
    </>
  )
}

/** A row's frame: one 36px line, 24px gutters, a subtle fill on hover, no divider. */
const ROW =
  "flex min-h-9 w-full items-center gap-2 px-6 py-2 text-left outline-none hover:bg-accent/40 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"

/** The frame of a row with actions after its link or button: `ROW`'s line, its right gutter after the actions. */
const ROW_FRAME = "flex min-h-9 w-full items-center gap-2 pr-6 hover:bg-accent/40"

/** The link or button of a row with actions: `ROW`'s cells, its left gutter, the width the actions leave. */
const ROW_MAIN =
  "flex min-w-0 flex-1 items-center gap-2 self-stretch py-2 pl-6 text-left outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"

/** The members of an opened row, indented beneath it along a guide line under its chevron. */
const MEMBERS = "relative before:absolute before:inset-y-0 before:left-8 before:w-px before:bg-border"

/**
 * A row's head: its ID (a change's, a series', a project's or a group's name) in mono on a first line, and its text
 * under it in muted (a change's description, a series' number of changes, a project's path), each truncating. A row
 * that opens has its chevron (`lead`) first, level with the ID; a row that does not starts its ID where a chevron
 * would be, so it never reads as a member of the opened row above it. A member of an opened row is indented past the
 * opened row's ID.
 */
function RowHead({
  lead,
  id,
  text,
  member = false,
}: {
  lead?: ReactNode
  id: string
  text?: ReactNode
  member?: boolean
}) {
  return (
    <span className={cn("flex min-w-0 flex-1 items-start gap-2", member && "pl-10")}>
      {lead !== undefined ? (
        <span className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground">{lead}</span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-sm text-foreground">{id}</span>
        {text !== undefined && text !== null ? (
          <span className="truncate text-sm text-muted-foreground">{text}</span>
        ) : null}
      </span>
    </span>
  )
}

/** A change row's cells: its head (`RowHead`), its project, its progress and its age. */
function RowCells({
  lead,
  id,
  text,
  project,
  progress,
  age,
  member = false,
}: {
  lead?: ReactNode
  id: string
  text?: ReactNode
  project?: string
  progress: ReactNode
  age: string
  member?: boolean
}) {
  return (
    <>
      <RowHead lead={lead} id={id} text={text} member={member} />
      {project !== undefined ? (
        <span className="hidden w-35 shrink-0 truncate pl-4 text-sm text-muted-foreground md:block">{project}</span>
      ) : null}
      {progress}
      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{age}</span>
    </>
  )
}

/**
 * A row that opens to list its members beneath it, indented along a guide line: a series on Now, a group on All
 * projects. The row is one button, its chevron passed to `cells` as their lead; `actions`, when given, sit after it.
 */
function OpenRow({
  open,
  onToggle,
  cells,
  actions,
  children,
}: {
  open: boolean
  onToggle: () => void
  cells: (lead: ReactNode) => ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon
  const button = (
    <button
      type="button"
      data-nav-item=""
      aria-expanded={open}
      onClick={onToggle}
      className={actions === undefined ? ROW : ROW_MAIN}
    >
      {cells(<Chevron aria-hidden="true" className="size-3.5" />)}
    </button>
  )
  return (
    <li>
      {actions === undefined ? (
        button
      ) : (
        <div className={ROW_FRAME}>
          {button}
          {actions}
        </div>
      )}
      {open ? <ul className={MEMBERS}>{children}</ul> : null}
    </li>
  )
}

/** A change's row: its description then its ID (its ID alone when none), its project when `project`, progress and age. */
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
      <Link href={changePath(projectKey, change.id)} className={ROW}>
        <RowCells
          id={change.id}
          text={change.description ?? undefined}
          project={project}
          progress={<Progress done={change.done} total={change.total} status={change.status} />}
          age={ageOf(change.updated, now)}
          member={member}
        />
      </Link>
    </li>
  )
}

/**
 * A series' row: the series ID and its number of changes, its summed progress and latest age; it opens to list its
 * members, indented along a guide line, each with its ID over its description.
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
  return (
    <OpenRow
      open={open}
      onToggle={() => setOpen(!open)}
      cells={(lead) => (
        <RowCells
          lead={lead}
          id={row.id}
          text={`series of ${row.count}`}
          project={project}
          progress={
            row.progress !== null ? (
              <Progress done={row.progress.done} total={row.progress.total} status={row.status} />
            ) : (
              <NoProgress />
            )
          }
          age={ageOf(row.updated, now)}
        />
      )}
    >
      {row.children.map((c) => (
        <ChangeRow key={c.id} projectKey={projectKey} change={c.change} project={project} now={now} member />
      ))}
    </OpenRow>
  )
}

/** One row of a project's open changes, a change or a series, with the project's key and label. */
type Located = { key: string; label: string; row: ActiveRow }

/** The open rows of `projects` (a series of two or more as one row) whose ID or description holds `q`, newest first. */
function located(lists: Map<string, ChangeList>, projects: readonly Project[], q: string): Located[] {
  const updated = (r: ActiveRow) => (r.kind === "series" ? r.updated : r.change.updated)
  return projects
    .flatMap((p) => activeRows(lists.get(p.key)?.active ?? [], q).map((row) => ({ key: p.key, label: p.label, row })))
    .sort((a, b) => updated(b.row).localeCompare(updated(a.row)))
}

/** A located row's values in the lists' filter fields: its status and its project. */
const locatedValues = (r: Located, field: string): string[] =>
  field === "status" ? [rowStatus(r.row)] : field === "project" ? [r.key] : []

/** The changes a row holds: a series row its listed members. */
const changesOf = (r: Located): number => changeCount([r.row])

/** A status as the lists title it. */
const GROUP_TITLE: Record<Status, string> = {
  invalid: "Needs fixing",
  "in-progress": "In progress",
  "not-started": "Not started",
  ready: "Ready to archive",
  archived: "Archived",
}

/** A group of a grouped list: its band and its body, and whether it starts collapsed. */
type Group = { id: string; label: ReactNode; mark?: ReactNode; count: number; collapsed?: boolean; body: ReactNode }

/**
 * The groups of a page, each a band over its rows, with no gap or divider between them. Each group's collapsed state
 * is kept per page (`page`); Alt and a click on a band collapses or opens every group of the page.
 */
function Groups({ page, groups }: { page: string; groups: Group[] }) {
  const choices = useCollapsed(page)
  const ids = groups.map((g) => g.id)
  return (
    <>
      {groups.map((g) => (
        <GroupBand
          key={g.id}
          label={g.label}
          mark={g.mark}
          count={g.count}
          open={!choices.collapsed(g.id, g.collapsed)}
          onToggle={(open, all) => choices.set(all ? ids : [g.id], !open)}
        >
          {g.body}
        </GroupBand>
      ))}
    </>
  )
}

/** The rows of one status group. */
function RowList({ rows, showProject, now }: { rows: Located[]; showProject: boolean; now: number }) {
  return (
    <ul data-nav-list="">
      {rows.map((r) =>
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
  )
}

/**
 * The status groups of `rows`: Needs fixing, In progress, Not started, then Ready to archive (as rows, or with
 * `readyByProject` as one count per project, which opens that project's page). Each band counts its rows, a series
 * once; Ready to archive by project counts its changes. Ready to archive starts collapsed.
 */
function statusGroups(
  rows: readonly Located[],
  { showProject, readyByProject, now }: { showProject: boolean; readyByProject: boolean; now: number },
): Group[] {
  const groups: Group[] = []
  for (const status of ["invalid", "in-progress", "not-started"] as const) {
    const kept = rows.filter((r) => rowStatus(r.row) === status)
    if (kept.length === 0) continue
    groups.push({
      id: status,
      label: GROUP_TITLE[status],
      mark: <StatusMark status={status} />,
      count: kept.length,
      body: <RowList rows={kept} showProject={showProject} now={now} />,
    })
  }
  const ready = rows.filter((r) => rowStatus(r.row) === "ready")
  if (ready.length === 0) return groups
  const perProject = [...new Set(ready.map((r) => r.key))].map((key) => {
    const own = ready.filter((r) => r.key === key)
    return { key, label: own[0]?.label ?? key, n: own.reduce((n, r) => n + changesOf(r), 0) }
  })
  groups.push({
    id: "ready",
    label: GROUP_TITLE.ready,
    mark: <StatusMark status="ready" />,
    count: readyByProject ? perProject.reduce((n, p) => n + p.n, 0) : ready.length,
    collapsed: true,
    body: readyByProject ? (
      <div className="flex flex-wrap gap-2 px-6 py-3">
        {perProject.map((p) => (
          <Link
            key={p.key}
            href={projectPath(p.key)}
            className="rounded-md border px-3 py-1 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            {p.label}
            <span className="ml-2 font-medium text-success tabular-nums">{p.n}</span>
          </Link>
        ))}
      </div>
    ) : (
      <RowList rows={ready} showProject={showProject} now={now} />
    ),
  })
  return groups
}

/** The month heading of an archive date `YYYY-MM-DD…`: "November 2026". */
const monthOf = (date: string): string => {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00`)
  return Number.isNaN(d.getTime())
    ? date.slice(0, 7)
    : d.toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

/** An archived change with its project's key. */
type Archived = { key: string; a: ArchivedChange }

/** An archived change's values in the lists' filter fields. */
const archivedValues = (r: Archived, field: string): string[] =>
  field === "status" ? ["archived"] : field === "project" ? [r.key] : []

/** The archived changes of `keys`' lists, newest first. */
const archivesOf = (lists: Map<string, ChangeList>, keys: readonly string[]): Archived[] =>
  keys
    .flatMap((k) => (lists.get(k)?.archived ?? []).map((a) => ({ key: k, a })))
    .sort((x, y) => y.a.date.localeCompare(x.a.date) || y.a.updated.localeCompare(x.a.updated))

/** The archived changes of `rows` whose ID holds `q`, ignoring case. */
const archivesMatching = (rows: readonly Archived[], q: string): Archived[] =>
  rows.filter(({ a }) => fileMatches({ name: a.id }, q))

/**
 * The archive months of `rows` (newest first), each a group of its rows; the first open, the older ones collapsed.
 * Each row lines up with the open changes' rows: its ID, its project (`withProject`) and its archive date (`MM-DD`)
 * in the age column.
 */
function archiveGroups(rows: readonly Archived[], withProject: boolean, label: (k: string) => string): Group[] {
  const months: { id: string; month: string; rows: Archived[] }[] = []
  for (const r of rows) {
    const id = monthGroup(r.a.date)
    const last = months.at(-1)
    if (last?.id === id) last.rows.push(r)
    else months.push({ id, month: monthOf(r.a.date), rows: [r] })
  }
  return months.map((m, i) => ({
    id: m.id,
    label: m.month,
    mark: <StatusMark status="archived" />,
    count: m.rows.length,
    collapsed: i > 0,
    body: (
      <ul data-nav-list="">
        {m.rows.map(({ key, a }) => (
          <li key={`${key}/${a.dir}`} data-nav-item="">
            <Link href={archivePath(key, a.dir)} className={ROW}>
              <RowCells
                id={a.id}
                project={withProject ? label(key) : undefined}
                progress={<NoProgress />}
                age={a.date}
              />
            </Link>
          </li>
        ))}
      </ul>
    ),
  }))
}

/** The Status field's values: the open changes' statuses, then Archived. */
const STATUS_VALUES = ["invalid", "in-progress", "not-started", "ready", "archived"] as const

/** The Status field of a list: one value per status the page lists, each with its mark. */
const statusField = (statuses: readonly Status[], counts: ReadonlyMap<string, number>): BarField => ({
  id: "status",
  label: "Status",
  icon: <CircleDotIcon aria-hidden="true" />,
  options: statuses.map((s) => ({ value: s, label: GROUP_TITLE[s], icon: <StatusMark status={s} /> })),
  counts,
})

/** The Project field of a list over several projects. */
const projectField = (projects: readonly Project[], counts: ReadonlyMap<string, number>): BarField => ({
  id: "project",
  label: "Project",
  icon: <FolderIcon aria-hidden="true" />,
  options: [...projects].sort((a, b) => a.label.localeCompare(b.label)).map((p) => ({ value: p.key, label: p.label })),
  counts,
})

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

/** A list page's scrolling body under its filter bar, the page's full width. */
function ScrollBody({ children }: { children: ReactNode }) {
  return (
    <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
      {children}
    </div>
  )
}

/** A line of the page's own, in its 24px gutters. */
function Note({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return (
    <p className={cn("px-6 py-3 text-sm", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
      {children}
    </p>
  )
}

const NOW_FIELDS = ["project", "status"] as const

/**
 * `#/`: every project's changes in focus order: needs fixing, In progress, Not started, Ready to archive counted. With
 * Status is Archived, every project's archived changes too, by month.
 */
export function NowPage() {
  const { projects, gate } = useProjectsGate()
  const list = useMemo(() => projects ?? [], [projects])
  const keys = list.map((p) => p.key)
  const { lists, failed } = useListsOf(keys)
  const now = useNow()
  const [filter, setFilter] = useListFilter("now", NOW_FIELDS)
  const label = useLabel()
  const searched = located(lists, list, filter.q)
  const kept = searched.filter((r) => passesAll(r, filter.rules, locatedValues))
  // The archive is listed only once Status is Archived; its count is in the Status menu all along.
  const withArchive = picks(filter.rules, "status", "archived")
  const archiveAll = archivesOf(lists, keys)
  const archiveSearched = archivesMatching(archiveAll, filter.q)
  const archived = withArchive ? archiveSearched.filter((r) => passesAll(r, filter.rules, archivedValues)) : []
  const countsOf = (field: string, archive: boolean) => {
    const counts = valueCounts(searched, field, filter.rules, locatedValues)
    if (archive)
      for (const [v, n] of valueCounts(archiveSearched, field, filter.rules, archivedValues))
        counts.set(v, (counts.get(v) ?? 0) + n)
    return counts
  }
  const fields = [
    projectField(
      list.filter((p) => p.active > 0 || (withArchive && (lists.get(p.key)?.archived.length ?? 0) > 0)),
      countsOf("project", withArchive),
    ),
    statusField(STATUS_VALUES, countsOf("status", true)),
  ]
  const groups = [
    ...statusGroups(kept, { showProject: true, readyByProject: true, now }),
    ...archiveGroups(archived, true, label),
  ]
  const open = located(lists, list, "").reduce((n, r) => n + changesOf(r), 0)
  return (
    <>
      <PageHeader title="Now" />
      <PageBody>
        <FilterBar
          fields={fields}
          filter={filter}
          onChange={setFilter}
          searchLabel="Search changes"
          shown={projects !== null ? kept.reduce((n, r) => n + changesOf(r), 0) + archived.length : null}
          total={projects !== null ? open + (withArchive ? archiveAll.length : 0) : null}
          noun="change"
        />
        <ScrollBody>
          {gate}
          {failed.length > 0 ? (
            <Note tone="error">Could not load the changes of {countOf(failed.length, "project")}.</Note>
          ) : null}
          {groups.length > 0 ? (
            <>
              <Groups page="now" groups={groups} />
              <CollapseHint />
            </>
          ) : projects === null ? null : isNarrowed(filter) ? (
            <NoMatch nouns="changes" filter={filter} fields={fields} onClear={() => setFilter(NO_FILTER)} />
          ) : (
            <Note>Nothing open.</Note>
          )}
        </ScrollBody>
      </PageBody>
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
  const edit = useEditSettings()
  const { lists } = useListsOf(list.map((p) => p.key))
  const [filter, setFilter] = useListFilter("projects", PROJECT_FIELDS)
  const choices = useCollapsed("projects")
  const [naming, setNaming] = useState<Naming>(null)
  const [error, setError] = useState<string | null>(null)
  const save = (f: Parameters<typeof edit>[0]) => {
    setError(null)
    edit(f).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  const label = useLabel()
  const latest = (keys: readonly string[]) =>
    keys.map((k) => lastArchived(lists.get(k)?.archived)).reduce((a, b) => (a > b ? a : b), "")
  const inProgress = (keys: readonly string[]) =>
    keys.reduce((n, k) => n + (lists.get(k)?.active.filter((c) => c.status === "in-progress").length ?? 0), 0)
  const toDoOf = (keys: readonly string[]) => keys.reduce((n, k) => n + toDo(lists.get(k)), 0)
  const valuesOf = (key: string, field: string) => projectValues(settings, key, field)
  const byLatest = (a: string, b: string) => latest([b]).localeCompare(latest([a])) || label(a).localeCompare(label(b))
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
    .sort((a, b) => latest(b.e.keys).localeCompare(latest(a.e.keys)) || a.e.label.localeCompare(b.e.label))
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
      <span className={cn(COUNT, IN_PROGRESS, inProgress(keys) > 0 && "text-warning")}>{inProgress(keys)}</span>
      <span className={cn(COUNT, TO_DO)}>{toDoOf(keys)}</span>
      <span className={cn(COUNT, LAST_ARCHIVED)}>{latest(keys) || "–"}</span>
    </>
  )

  /** A project's row: its name then its path, its counts, then its pin (alone, not in a group) and its menu. */
  const projectRow = (e: Entry, key: string, member = false) => (
    <li key={key}>
      <div className={ROW_FRAME}>
        <Link href={projectPath(key)} data-nav-item="" className={ROW_MAIN}>
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
        {error !== null ? <Note tone="error">Could not save: {error}</Note> : null}
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

const SCOPE_FIELDS = ["status", "project"] as const

/**
 * A project's or a group's page (`#/<key>`, `#/group/<id>`): its open changes by status, then its archive by month
 * (the twelve newest, all of it with `?archive`). Opening it records it among the recently opened.
 */
export function ScopePage({ id, all }: { id: string; all: boolean }) {
  const { projects, gate } = useProjectsGate()
  const list = useMemo(() => projects ?? [], [projects])
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
  const now = useNow()
  const [filter, setFilter] = useListFilter(id, SCOPE_FIELDS)
  const scoped = list.filter((p) => keys.includes(p.key))
  const label = useLabel()
  const isGroup = entry?.kind === "group"

  const searched = all ? [] : located(lists, scoped, filter.q)
  const open = searched.filter((r) => passesAll(r, filter.rules, locatedValues))
  const archiveAll = archivesOf(lists, keys)
  const archiveSearched = archivesMatching(archiveAll, filter.q)
  const archived = archiveSearched.filter((r) => passesAll(r, filter.rules, archivedValues))
  const limit = all || isNarrowed(filter) ? null : 12
  const archiveShown = limit === null ? archived : archived.slice(0, limit)

  const countsOf = (field: string) => {
    const counts = valueCounts(searched, field, filter.rules, locatedValues)
    for (const [v, n] of valueCounts(archiveSearched, field, filter.rules, archivedValues))
      counts.set(v, (counts.get(v) ?? 0) + n)
    return counts
  }
  const fields = [
    statusField(all ? ["archived"] : STATUS_VALUES, countsOf("status")),
    ...(isGroup ? [projectField(scoped, countsOf("project"))] : []),
  ]
  const groups = [
    ...statusGroups(open, { showProject: isGroup, readyByProject: false, now }),
    ...archiveGroups(archiveShown, keys.length > 1, label),
  ]
  const total = located(lists, scoped, "").reduce((n, r) => n + changesOf(r), 0) + archiveAll.length
  const shown = open.reduce((n, r) => n + changesOf(r), 0) + archived.length

  return (
    <>
      <PageHeader
        title={entry?.label ?? ""}
        parent={
          group !== undefined ? { label: group.name, href: `/group/${encodeURIComponent(group.id)}?` } : undefined
        }
      />
      <PageBody>
        {entry !== null ? (
          <FilterBar
            fields={fields}
            filter={filter}
            onChange={setFilter}
            searchLabel="Search changes"
            shown={shown}
            total={total}
            noun="change"
          />
        ) : null}
        <ScrollBody>
          {gate}
          {projects !== null && entry === null ? <Note>This project or group no longer exists.</Note> : null}
          {entry !== null && groups.length > 0 ? (
            <>
              <Groups page={id} groups={groups} />
              {limit !== null && archived.length > limit ? (
                <Link
                  href={`${entry.href.replace(/\?$/, "")}?archive`}
                  className="mx-6 mt-3 inline-block text-sm text-link hover:underline"
                >
                  All archived →
                </Link>
              ) : null}
              <CollapseHint />
            </>
          ) : null}
          {entry !== null && groups.length === 0 ? (
            isNarrowed(filter) ? (
              <NoMatch nouns="changes" filter={filter} fields={fields} onClear={() => setFilter(NO_FILTER)} />
            ) : (
              <Note>{all ? "Nothing archived yet." : "Nothing open, nothing archived yet."}</Note>
            )
          ) : null}
        </ScrollBody>
      </PageBody>
    </>
  )
}
