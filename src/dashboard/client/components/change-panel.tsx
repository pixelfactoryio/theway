import type { ReactNode } from "react"
import { Link } from "wouter"

import { StatusIcon } from "@/components/status"
import { CopyField, OneLine, TaskText } from "@/components/text"
import { type ChangeDetail, nextTask, runCommand, type SeriesMember } from "@/lib/changes"

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

const memberHref = (key: string, m: { active: string | null; archived: string | null }): string =>
  m.active !== null ? `/${key}/changes/${m.active}?` : `/${key}/changes/archive/${m.archived}?`

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
  const classes = "flex h-8 min-w-0 items-center gap-2 rounded-md px-2"
  if (shown.status === null || (shown.active === null && shown.archived === null)) {
    return (
      <li
        className={current !== null ? `${classes} bg-muted` : classes}
        aria-current={current !== null ? "true" : undefined}
      >
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
    <li
      className={current !== null ? `${classes} bg-muted` : classes}
      aria-current={current !== null ? "true" : undefined}
    >
      <StatusIcon status={shown.status} />
      <Link href={memberHref(projectKey, shown)} className="min-w-0 flex-1 underline-offset-4 hover:underline">
        <OneLine text={shown.id} />
      </Link>
      <span className="shrink-0 text-muted-foreground tabular-nums">{right}</span>
    </li>
  )
}

/** The change page's right panel: Next task, Run, Series, Archived and Folder. */
export function ChangePanel({ projectKey, change }: { projectKey: string; change: ChangeDetail }) {
  const archived = change.archived !== null
  const invalid = change.status === "invalid"
  const next = nextTask(change.tasks)
  const run = runCommand(change)
  const ordinal = /-(\d{2})$/.exec(change.id)?.[1]
  return (
    <div className="flex flex-col gap-4 p-4">
      <dl className="flex flex-col gap-4">
        {!archived && !invalid ? (
          <Row label="Next task">
            {next === null ? (
              "All tasks are done."
            ) : (
              <div className="flex gap-2">
                <span className="shrink-0 text-muted-foreground tabular-nums">{next.n}.</span>
                <span>
                  <TaskText text={next.text} />
                </span>
              </div>
            )}
          </Row>
        ) : null}
        {!archived ? (
          <Row label="Run">
            <CopyField value={run.command} name={run.name} />
          </Row>
        ) : null}
        {change.series !== null ? (
          <Row label="Series">
            <ol className="-mx-2 flex flex-col">
              {change.series.members.map((m) => (
                <SeriesRow
                  key={m.ordinal}
                  projectKey={projectKey}
                  member={m}
                  current={m.ordinal === ordinal ? change : null}
                />
              ))}
            </ol>
          </Row>
        ) : null}
        {archived ? (
          <Row label="Archived">
            <span className="tabular-nums">{change.archived}</span>
          </Row>
        ) : null}
        <Row label="Folder">
          <CopyField value={change.folder} name="the folder path" />
        </Row>
      </dl>
    </div>
  )
}
