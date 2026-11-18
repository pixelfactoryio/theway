import { cn } from "cn"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { Link } from "wouter"

import { GroupBand, useCollapsed } from "@/components/group-band"
import { useProjects } from "@/data/queries"
import { type ActiveChange, type ActiveStatus, ageOf, type SeriesRow, type Status } from "@/lib/changes"
import { type Project } from "@/lib/projects"
import { to } from "@/lib/routes"
import type { Located } from "@/lib/workspace"
import { LoadError } from "@/shell/load-error"

/** The time now, refreshed every minute, for the rows' ages. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
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
export function NoProgress() {
  return (
    <>
      <span className="hidden w-24 shrink-0 sm:block" />
      <span className="w-14 shrink-0" />
    </>
  )
}

/** A row's frame: one 36px line, 24px gutters, a subtle fill on hover, no divider. */
export const ROW =
  "flex min-h-9 w-full items-center gap-2 px-6 py-2 text-left outline-none hover:bg-accent/40 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"

/** The frame of a row with actions after its link or button: `ROW`'s line, its right gutter after the actions. */
export const ROW_FRAME = "flex min-h-9 w-full items-center gap-2 pr-6 hover:bg-accent/40"

/** The link or button of a row with actions: `ROW`'s cells, its left gutter, the width the actions leave. */
export const ROW_MAIN =
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
export function RowHead({
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
export function RowCells({
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
export function OpenRow({
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
      <Link href={to.change(projectKey, change.id)} className={ROW}>
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

/** A status as the lists title it. */
export const GROUP_TITLE: Record<Status, string> = {
  invalid: "Needs fixing",
  "in-progress": "In progress",
  "not-started": "Not started",
  ready: "Ready to archive",
  archived: "Archived",
}

/** A group of a grouped list: its band and its body, and whether it starts collapsed. */
export type Group = {
  id: string
  label: ReactNode
  mark?: ReactNode
  count: number
  collapsed?: boolean
  body: ReactNode
}

/**
 * The groups of a page, each a band over its rows, with no gap or divider between them. Each group's collapsed state
 * is kept per page (`page`); Alt and a click on a band collapses or opens every group of the page.
 */
export function Groups({ page, groups }: { page: string; groups: Group[] }) {
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
export function RowList({ rows, showProject, now }: { rows: Located[]; showProject: boolean; now: number }) {
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

/** What a page shows while the projects load or after they failed: `null` once they are known. */
export function useProjectsGate(): { projects: Project[] | null; gate: ReactNode } {
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
export function ScrollBody({ children }: { children: ReactNode }) {
  return (
    <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
      {children}
    </div>
  )
}

/** A line of the page's own, in its 24px gutters. */
export function Note({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return (
    <p className={cn("px-6 py-3 text-sm", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
      {children}
    </p>
  )
}
