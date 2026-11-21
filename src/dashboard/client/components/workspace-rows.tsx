import { type ReactNode, useEffect, useState } from "react"

import { SectionBand, useCollapsed } from "@/components/group-band"
import { useProjects } from "@/data/queries"
import { type Status } from "@/lib/changes"
import { type Project } from "@/lib/projects"
import { PageLoadError } from "@/shell/load-error"
import { StateLoading } from "@/shell/state"

/** The time now, refreshed every minute, for the rows' ages. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** A status as the lists title it. */
export const GROUP_TITLE: Record<Status, string> = {
  invalid: "Invalid",
  "in-progress": "In progress",
  "not-started": "Not started",
  ready: "Ready to archive",
  archived: "Archived",
}

/** A section of a list: its band and its rows, and whether it starts collapsed. */
export type Group = {
  id: string
  label: ReactNode
  mark?: ReactNode
  /** The rows the section holds, or `N of M` when it lists only some. */
  count: number | string
  collapsed?: boolean
  body: ReactNode
}

/**
 * The sections of a page, in their order, each a band over its rows, with no gap or divider between
 * them. Each section's collapsed state is kept per page (`page`); Alt and a click on a band collapses or opens every
 * section of the page.
 */
export function Sections({ page, groups }: { page: string; groups: Group[] }) {
  const choices = useCollapsed(page)
  const ids = groups.map((g) => g.id)
  return (
    <>
      {groups.map((g) => (
        <SectionBand
          key={g.id}
          label={g.label}
          mark={g.mark}
          count={g.count}
          open={!choices.collapsed(g.id, g.collapsed)}
          onToggle={(open, all) => choices.set(all ? ids : [g.id], !open)}
        >
          {g.body}
        </SectionBand>
      ))}
    </>
  )
}

/**
 * What a page shows while the projects load (the one loading line, after 400ms) or after they failed: `null` once they
 * are known.
 */
export function useProjectsGate(): { projects: Project[] | null; gate: ReactNode } {
  const query = useProjects()
  if (query.isPending) return { projects: null, gate: <StateLoading size="page" /> }
  if (query.isError)
    return {
      projects: null,
      gate: <PageLoadError what="the projects" error={query.error} retry={() => void query.refetch()} />,
    }
  return { projects: query.data?.projects ?? null, gate: null }
}

/** A list page's scrolling body under its filter bar, the panel's full width. */
export function ScrollBody({ children }: { children: ReactNode }) {
  return (
    <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
      {children}
    </div>
  )
}
