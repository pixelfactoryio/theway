import type { ReactNode } from "react"

import { ChangeProgress } from "@/components/change-progress"
import { CopyButton } from "@/components/copy"
import { StatusCard } from "@/components/fact-cards"
import {
  ACTIONS_COLUMN,
  COLUMN,
  CopyIdMenu,
  IdChip,
  IdName,
  type ListColumn,
  ListRow,
  ListRows,
} from "@/components/list-kit"
import { PropertyCard, PropertyCards, PropertyList, PropertyRow } from "@/components/property-card"
import { StatusMark, StatusPill } from "@/components/status"
import { CopyPath } from "@/components/title-block"
import { useChangeLists, useLabel } from "@/data/queries"
import { type ChangeDetail, localDate, memberOf, ownDescription, type SeriesMember } from "@/lib/changes"
import { to } from "@/lib/routes"

/** A member's page, `null` for a member with neither an active ID nor an archive reference. */
const memberHref = (key: string, m: { active: string | null; archived: string | null }): string | null =>
  m.active !== null ? to.change(key, m.active) : m.archived !== null ? to.archived(key, m.archived) : null

/** The Series card's column: a member's progress, or Archived; then the row's "…" menu (`ACTIONS_COLUMN`). */
const PROGRESS: ListColumn = { id: "progress", title: "Progress", className: COLUMN.progress, align: "end" }

/**
 * One ordinal of the Series card, a row of the list kit: its status icon, its description then its ID's chip, both cut
 * as the panel narrows, the chip in the middle so its distinct tail stays (the chip alone, in the name's place, for a
 * member whose description is not known, an archived one, or only repeats its ID), and its progress, `Archived` or `–` at the right; the current change's row shows the current change itself
 * and is marked as the current one. An ordinal with no change gives its would-be ID's chip alone, in the secondary ink.
 */
function SeriesRow({
  projectKey,
  member,
  description,
  current,
}: {
  projectKey: string
  member: SeriesMember
  /** The member's description, from the project's change list, `null` when it has none or it is not known. */
  description: string | null
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
  const href = memberHref(projectKey, shown)
  const lead = ownDescription(current !== null ? current.description : description, shown.id)
  if (shown.status === null || href === null) {
    return (
      <li className="flex h-9 items-center gap-3 border-b border-rule px-4">
        <span className="w-4 shrink-0" />
        <span className="w-3.5 shrink-0" />
        <IdChip className="text-muted-foreground">{shown.id}</IdChip>
      </li>
    )
  }
  const right =
    shown.status === "archived" ? (
      "Archived"
    ) : shown.status === "invalid" ? (
      "–"
    ) : (
      <span className="tabular-nums">
        {shown.done ?? 0}/{shown.total ?? 0}
      </span>
    )
  return (
    <ListRow
      head={{ href }}
      icon={<StatusMark status={shown.status} />}
      current={current !== null}
      meta={lead !== null ? <IdChip>{shown.id}</IdChip> : undefined}
      cells={[
        { column: PROGRESS, content: right },
        { column: ACTIONS_COLUMN, content: <CopyIdMenu id={shown.id} what="the change ID" /> },
      ]}
    >
      {lead ?? <IdName>{shown.id}</IdName>}
    </ListRow>
  )
}

/**
 * The change page's panel, after Linear's item page: stacked property cards. First the status and the progress; then
 * Tasks (`tasks`, the page's read-only list), Details (`description` first) and, for a member of a series, Series,
 * which lists its members and opens them. `tasks` is `null` when the page shows the tasks in its centre.
 */
export function ChangePanel({
  projectKey,
  change,
  tasks,
  description,
}: {
  projectKey: string
  change: ChangeDetail
  tasks: ReactNode | null
  description: ReactNode | null
}) {
  const archived = change.archived !== null
  const project = useLabel()(projectKey)
  const ordinal = memberOf(change.id)?.ordinal
  // The project's change list, which the sidebar has loaded: the descriptions of the series' open members.
  const list = useChangeLists([projectKey]).lists.get(projectKey)
  const describe = (m: SeriesMember): string | null =>
    m.active !== null ? (list?.active.find((a) => a.id === m.active)?.description ?? null) : null
  return (
    <PropertyCards>
      <StatusCard
        status={change.status}
        action={
          change.status !== "invalid" ? (
            <ChangeProgress done={change.done} total={change.total} status={change.status} />
          ) : undefined
        }
      />
      {tasks !== null ? (
        <PropertyCard title="Tasks" meta={<span className="tabular-nums">{change.total}</span>}>
          {tasks}
        </PropertyCard>
      ) : null}
      <PropertyCard title="Details">
        <PropertyList>
          {description !== null ? <PropertyRow label="Description">{description}</PropertyRow> : null}
          <PropertyRow label="Project">{project}</PropertyRow>
          <PropertyRow label="ID">
            <span className="flex min-w-0 items-center gap-1">
              <IdChip>{change.id}</IdChip>
              <CopyButton value={change.id} what="the change ID" />
            </span>
          </PropertyRow>
          <PropertyRow label="Folder">
            <CopyPath value={change.folder} what="the folder path" />
          </PropertyRow>
          {archived ? (
            <PropertyRow label="Archived">{change.archived}</PropertyRow>
          ) : (
            <PropertyRow label="Updated">{localDate(change.updated)}</PropertyRow>
          )}
        </PropertyList>
      </PropertyCard>
      {change.series !== null ? (
        <PropertyCard title="Series" meta={<span className="tabular-nums">{change.series.members.length}</span>}>
          <div className="border-t border-rule [&_li:last-child]:border-b-0">
            <ListRows label="Series">
              {change.series.members.map((m) => (
                <SeriesRow
                  key={m.ordinal}
                  projectKey={projectKey}
                  member={m}
                  description={describe(m)}
                  current={m.ordinal === ordinal ? change : null}
                />
              ))}
            </ListRows>
          </div>
        </PropertyCard>
      ) : null}
    </PropertyCards>
  )
}

/**
 * The status and the progress, as the page's header gives them while the panel is not shown: the status, then the
 * progress (none while invalid).
 */
export function ChangeStatus({ change }: { change: ChangeDetail }) {
  return (
    <>
      <StatusPill status={change.status} />
      {change.status !== "invalid" ? (
        <ChangeProgress done={change.done} total={change.total} status={change.status} />
      ) : null}
    </>
  )
}
