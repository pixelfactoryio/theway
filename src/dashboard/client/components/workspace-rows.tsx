import { cn } from "cn"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { Link } from "wouter"

import { GroupBand, useCollapsed } from "@/components/group-band"
import { useProjects } from "@/data/queries"
import { type Status } from "@/lib/changes"
import { type Project } from "@/lib/projects"
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

/** The progress columns of a row with none: as wide as a row's `ChangeProgress`, empty. */
export function NoProgress() {
  return (
    <>
      <span className="hidden w-24 shrink-0 sm:block" />
      <span className="w-14 shrink-0" />
    </>
  )
}

/** A row head's link or toggle in its grid cell: the cell's width; its focus shows on its whole row (`BandGrid`). */
const HEAD = "flex w-full min-w-0 text-left outline-none"

/** A member's head: the guide line of its opened row, under that row's chevron (its cell is `relative`). */
const GUIDE = "before:absolute before:inset-y-0 before:left-8 before:w-px before:bg-border"

/**
 * A row head that opens a page: a link carrying `data-nav-item`, which keeps its click from the row's own. A member's
 * draws the guide line it hangs on. The click stops on a wrapper that adds no box, not in the link's `onClick`: wouter
 * skips that `onClick` on a modifier click (a new tab), which would then reach the row and navigate this tab too.
 */
export function HeadLink({ href, member = false, children }: { href: string; member?: boolean; children: ReactNode }) {
  return (
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <Link href={href} data-nav-item="" className={cn(HEAD, member && GUIDE)}>
        {children}
      </Link>
    </span>
  )
}

/**
 * A row head that opens its members beneath it (a series, a group): a button carrying `data-nav-item` and
 * `aria-expanded`, its chevron passed to `head` as its lead, which keeps its click from the row's own.
 */
export function HeadToggle({
  open,
  onToggle,
  head,
}: {
  open: boolean
  onToggle: () => void
  head: (lead: ReactNode) => ReactNode
}) {
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon
  return (
    <button
      type="button"
      data-nav-item=""
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={HEAD}
    >
      {head(<Chevron aria-hidden="true" className="size-3.5" />)}
    </button>
  )
}

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
  /** The rows the group holds, or `N of M` when it lists only some. */
  count: number | string
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
