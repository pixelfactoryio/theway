import { ListChecksIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "wouter"

import { Frame, FrameHeader, FramePanel } from "@/components/reui/frame"
import { StatusIcon } from "@/components/status"
import { CopyField } from "@/components/text"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type ActiveChange,
  type ActiveRow,
  type ActiveStatus,
  actionGroups,
  type ArchivedChange,
  localDate,
  nextCommand,
  STATUS_LABEL,
  statusCounts,
} from "@/lib/changes"
import { changesPath } from "@/lib/projects"
import { NoChange } from "@/pages/changes-list"
import { useChanges } from "@/shell/changes"
import { LoadError } from "@/shell/load-error"
import { useProjects } from "@/shell/projects"
import { PageBody, TopBar } from "@/shell/top-bar"

/** The rows each Needs action group lists; the rest are behind its "N more" link. */
const SHOWN_ROWS = 3

/** The archived changes Recently archived lists. */
const SHOWN_ARCHIVED = 5

/** The count tiles' statuses, Invalid only when above 0. */
const COUNTED: ActiveStatus[] = ["in-progress", "not-started", "ready"]

const statusPath = (key: string, status: ActiveStatus): string => `/${key}/changes?status=${status}`

const LINK = "font-medium text-foreground underline-offset-4 hover:underline"

/** The page header: the project label as the page's `h1`, its folder to copy, and the link to every change. */
function Header({ projectKey, label, path }: { projectKey: string; label: string; path: string | null }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{label}</h1>
        {path !== null ? (
          <div className="max-w-xl">
            <CopyField value={path} name="the project folder" />
          </div>
        ) : null}
      </div>
      <Button variant="outline" render={<Link href={changesPath(projectKey)} />}>
        All changes
      </Button>
    </div>
  )
}

/** One count tile: its icon and label, then the number; the whole tile links to `href`. */
function CountTile({ icon, label, count, href }: { icon: ReactNode; label: string; count: number | null; href: string }) {
  return (
    <FramePanel className="transition-colors hover:bg-muted">
      <Link
        href={href}
        className="flex flex-col gap-1 rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {label}
        </span>
        {count === null ? (
          <Skeleton className="h-8 w-10" />
        ) : (
          <span className="text-2xl font-semibold tabular-nums">{count}</span>
        )}
      </Link>
    </FramePanel>
  )
}

/** The counts of the project's active changes, each linking to the Changes list it counts. */
function Counts({ projectKey, active }: { projectKey: string; active: readonly ActiveChange[] | undefined }) {
  const counts = active === undefined ? null : statusCounts(active, "")
  const statuses: ActiveStatus[] = counts !== null && counts.invalid > 0 ? [...COUNTED, "invalid"] : COUNTED
  return (
    <Frame className="grid grid-cols-2 sm:grid-cols-4">
      <CountTile
        icon={<ListChecksIcon className="size-4" aria-hidden="true" />}
        label="Active"
        count={active === undefined ? null : active.length}
        href={changesPath(projectKey)}
      />
      {statuses.map((s) => (
        <CountTile
          key={s}
          icon={<StatusIcon status={s} />}
          label={STATUS_LABEL[s]}
          count={counts === null ? null : counts[s]}
          href={statusPath(projectKey, s)}
        />
      ))}
    </Frame>
  )
}

/** A row's second line: a change's tasks and update date; a series' size, then its tasks when a member is valid. */
function rowDetail(row: ActiveRow): string {
  if (row.kind === "change") return `${row.change.done}/${row.change.total} tasks · updated ${localDate(row.change.updated)}`
  const size = `Series · ${row.count} changes`
  return row.progress === null ? size : `${size} · ${row.progress.done}/${row.progress.total} tasks`
}

/** One Needs action row: the ID as a link, its detail, and the command to copy (an Invalid row: what to fix). */
function ActionRow({ projectKey, row, active }: { projectKey: string; row: ActiveRow; active: readonly ActiveChange[] }) {
  const href = row.kind === "change" ? `/${projectKey}/changes/${row.id}?` : `/${projectKey}/changes?q=${row.id}`
  const command = nextCommand(row, active)
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={href} className={`truncate ${LINK}`}>
          {row.id}
        </Link>
        <span className="truncate text-sm text-muted-foreground">{rowDetail(row)}</span>
      </div>
      <div className="w-full shrink-0 sm:w-96">
        {command === null ? (
          <span className="text-sm text-muted-foreground">Fix change.yaml</span>
        ) : (
          <CopyField value={command} name="the command" />
        )}
      </div>
    </li>
  )
}

/** "Needs action": per status, its first rows with their command, and a link to the rest. */
function NeedsAction({ projectKey, active }: { projectKey: string; active: readonly ActiveChange[] | undefined }) {
  if (active !== undefined && active.length === 0) {
    return (
      <NoChange title="No active change">
        Write one with <code className="font-mono">/theway:engineering</code> in this repository.
      </NoChange>
    )
  }
  if (active === undefined) {
    return (
      <Frame>
        <FramePanel>
          <ul className="flex flex-col gap-4" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-4">
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-8 w-96 max-sm:hidden" />
              </li>
            ))}
          </ul>
        </FramePanel>
      </Frame>
    )
  }
  return (
    <Frame>
      {actionGroups(active).map(({ status, rows }) => (
        <section key={status} aria-label={STATUS_LABEL[status]} className="contents">
          <FrameHeader className="flex-row items-center gap-2 text-sm font-medium">
            <StatusIcon status={status} />
            {STATUS_LABEL[status]}
            <span className="text-muted-foreground tabular-nums">{rows.length}</span>
          </FrameHeader>
          <FramePanel>
            <ul className="flex flex-col divide-y">
              {rows.slice(0, SHOWN_ROWS).map((row) => (
                <ActionRow key={row.id} projectKey={projectKey} row={row} active={active} />
              ))}
            </ul>
            {rows.length > SHOWN_ROWS ? (
              <Link href={statusPath(projectKey, status)} className={`mt-3 inline-block text-sm ${LINK}`}>
                {rows.length - SHOWN_ROWS} more
              </Link>
            ) : null}
          </FramePanel>
        </section>
      ))}
    </Frame>
  )
}

/** "Recently archived": the newest archived changes, and a link to all of them. */
function RecentlyArchived({ projectKey, archived }: { projectKey: string; archived: readonly ArchivedChange[] }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3">
      <h2 className="text-base font-semibold">Recently archived</h2>
      <ol className="flex flex-col gap-2 text-sm">
        {archived.slice(0, SHOWN_ARCHIVED).map((a) => (
          <li key={a.dir} className="flex min-w-0 items-baseline gap-3">
            <span className="shrink-0 text-muted-foreground tabular-nums">{a.date}</span>
            <Link href={`/${projectKey}/changes/archive/${a.dir}?`} className={`truncate ${LINK}`}>
              {a.id}
            </Link>
          </li>
        ))}
      </ol>
      <Link href={`/${projectKey}/changes?view=archived`} className={`text-sm ${LINK}`}>
        All {archived.length} archived
      </Link>
    </section>
  )
}

/** `#/<key>`: what in the project needs an action, with the command to copy for each. */
export function OverviewPage({ projectKey }: { projectKey: string }) {
  const projects = useProjects()
  const changes = useChanges(projectKey)
  const project = projects.data?.projects.find((p) => p.key === projectKey)
  const top = <TopBar items={[{ selector: true }, { label: "Overview" }]} heading={false} />

  if (changes.isError) {
    return (
      <>
        {top}
        <PageBody>
          <LoadError what="the changes" error={changes.error} retry={() => void changes.refetch()} className="m-4 w-auto" />
        </PageBody>
      </>
    )
  }

  const list = changes.data
  return (
    <>
      {top}
      <PageBody>
        <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
            <Header projectKey={projectKey} label={project?.label ?? projectKey} path={project?.path ?? null} />
            <Counts projectKey={projectKey} active={list?.active} />
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <section className="flex min-w-0 flex-[2] flex-col gap-3">
                <div className="flex flex-col">
                  <h2 className="text-base font-semibold">Needs action</h2>
                  <p className="text-sm text-muted-foreground">Run these in Claude Code</p>
                </div>
                <NeedsAction projectKey={projectKey} active={list?.active} />
              </section>
              {list !== undefined && list.archived.length > 0 ? (
                <RecentlyArchived projectKey={projectKey} archived={list.archived} />
              ) : null}
            </div>
          </div>
        </div>
      </PageBody>
    </>
  )
}
