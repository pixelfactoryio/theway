import { cn } from "cn"
import type { ReactNode } from "react"
import { Link } from "wouter"

import { DetailRow, DocPanel, type PaneTab } from "@/components/doc-panel"
import { StatusMark, StatusPill } from "@/components/status"
import { OneLine } from "@/components/text"
import { type ChangeDetail, localDate, memberOf, type SeriesMember } from "@/lib/changes"
import { changePath } from "@/lib/projects"
import { useProjects } from "@/shell/projects"

const memberHref = (key: string, m: { active: string | null; archived: string | null }): string =>
  m.active !== null ? changePath(key, m.active) : `/${key}/changes/archive/${m.archived}?`

/** One ordinal of the series list; the current change's row shows the current change itself. */
function SeriesRow({
  projectKey,
  member,
  current,
}: {
  projectKey: string
  member: SeriesMember
  current: ChangeDetail | null
}) {
  const shown: SeriesMember =
    current !== null
      ? {
          ordinal: member.ordinal,
          id: current.id,
          active: current.ref === null ? current.id : null,
          archived: current.ref,
          status: current.status,
          done: current.ref === null ? current.done : null,
          total: current.ref === null ? current.total : null,
        }
      : member
  const classes = cn("flex h-8 min-w-0 items-center gap-3 px-4 text-sm", current !== null && "bg-accent")
  if (shown.status === null || (shown.active === null && shown.archived === null)) {
    return (
      <li className={classes} aria-current={current !== null ? "true" : undefined}>
        <span className="text-muted-foreground tabular-nums">{member.ordinal}</span>
      </li>
    )
  }
  const right =
    shown.status === "archived"
      ? "Archived"
      : shown.status === "invalid"
        ? "–"
        : `${shown.done ?? 0}/${shown.total ?? 0}`
  return (
    <li className={classes} aria-current={current !== null ? "true" : undefined}>
      <StatusMark status={shown.status} />
      <Link href={memberHref(projectKey, shown)} className="min-w-0 flex-1 underline-offset-4 hover:underline">
        <OneLine text={shown.id} />
      </Link>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{right}</span>
    </li>
  )
}

/** The progress bar and `done/total`, amber until every task is done. */
function Progress({ done, total }: { done: number; total: number }) {
  const ratio = total === 0 ? 0 : done / total
  return (
    <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
      <span className="relative h-1 w-28 overflow-hidden rounded-full bg-accent">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", ratio === 1 ? "bg-success" : "bg-warning")}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      {done}/{total}
    </span>
  )
}

/**
 * The change page's side panel: the status and progress in its header; Tasks on top (`tasks`, the page's list); then
 * Details (`description` first) and, for a member of a series, Series.
 */
export function ChangePanel({
  projectKey,
  change,
  tasks,
  description,
}: {
  projectKey: string
  change: ChangeDetail
  /** The Tasks pane, `null` when the page shows the tasks in its centre: Details and Series then fill the panel. */
  tasks: ReactNode | null
  description: ReactNode
}) {
  const archived = change.archived !== null
  const invalid = change.status === "invalid"
  const project = useProjects().data?.projects.find((p) => p.key === projectKey)?.label ?? projectKey
  const ordinal = memberOf(change.id)?.ordinal
  const top: PaneTab[] = [
    { value: "tasks", label: "Tasks", count: invalid ? "–" : `${change.done}/${change.total}`, content: tasks },
  ]
  const bottom: PaneTab[] = [
    {
      value: "details",
      label: "Details",
      content: (
        <dl className="flex flex-col py-2">
          <DetailRow label="Description">{description}</DetailRow>
          <DetailRow label="Project">
            <span className="block truncate">{project}</span>
          </DetailRow>
          <DetailRow label="ID">
            <span className="block truncate font-mono text-xs leading-5">{change.id}</span>
          </DetailRow>
          {archived ? (
            <DetailRow label="Archived">
              <span className="tabular-nums">{change.archived}</span>
            </DetailRow>
          ) : (
            <DetailRow label="Updated">
              <span className="tabular-nums">{localDate(change.updated)}</span>
            </DetailRow>
          )}
        </dl>
      ),
    },
  ]
  if (change.series !== null) {
    const series = change.series
    bottom.push({
      value: "series",
      label: "Series",
      count: series.members.length,
      content: (
        <ol className="flex flex-col py-1">
          {series.members.map((m) => (
            <SeriesRow
              key={m.ordinal}
              projectKey={projectKey}
              member={m}
              current={m.ordinal === ordinal ? change : null}
            />
          ))}
        </ol>
      ),
    })
  }
  return (
    <DocPanel
      remember={tasks === null ? "change-details" : "change"}
      label="Change"
      topShare="70%"
      header={
        <>
          <StatusPill status={change.status} />
          {!invalid ? <Progress done={change.done} total={change.total} /> : null}
        </>
      }
      top={tasks === null ? bottom : top}
      bottom={tasks === null ? undefined : bottom}
    />
  )
}
