import type { ColumnSizingState } from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { Link } from "wouter"

import { BandGrid } from "@/components/band-grid"
import { EmptyNote } from "@/components/empty-note"
import { FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { CollapseHint } from "@/components/group-band"
import { LIST_CAP, ListFoot, useSpare } from "@/components/list-grid"
import { PageUnknown } from "@/components/page-states"
import { Button } from "@/components/ui/button"
import {
  archiveGroups,
  projectField,
  STATUS_VALUES,
  statusField,
  statusGroups,
  useChangeGrid,
} from "@/components/workspace-bands"
import { Groups, ScrollBody, useProjectsGate } from "@/components/workspace-rows"
import { useChangeLists, useSettings } from "@/data/queries"
import { isNarrowed, NO_FILTER, passesAll } from "@/lib/list-filter"
import { to } from "@/lib/routes"
import {
  archivedValues,
  archivesMatching,
  archivesOf,
  changesOf,
  countsOf,
  entryOf,
  located,
  locatedValues,
  treeRows,
} from "@/lib/workspace"
import { recordedId, useRecordVisit } from "@/shell/settings"
import { PageBody, PageHeader } from "@/shell/top-bar"

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
  const { lists, pending } = useChangeLists(keys)
  const [filter, setFilter] = useListFilter(id, SCOPE_FIELDS)
  const [sizing, setSizing] = useState<ColumnSizingState>({})
  const isGroup = entry?.kind === "group"
  const { spare, sizer } = useSpare(LIST_CAP.changes)
  const scoped = list.filter((p) => keys.includes(p.key))

  const searched = all ? [] : located(lists, scoped, filter.q)
  const open = searched.filter((r) => passesAll(r, filter.rules, locatedValues))
  // A group's page names each row's project, in its open bands and its archive bands alike: they share one header.
  // The progress column stands only over an open change: a list of archived changes alone has none.
  const grid = useChangeGrid(sizing, setSizing, { project: isGroup, progress: open.length > 0, spare })
  const archiveAll = archivesOf(lists, keys)
  const archiveSearched = archivesMatching(archiveAll, filter.q)
  const archived = archiveSearched.filter((r) => passesAll(r, filter.rules, archivedValues))
  const limit = all || isNarrowed(filter) ? null : 12
  const archiveShown = limit === null ? archived : archived.slice(0, limit)

  const fields = [
    statusField(all ? ["archived"] : STATUS_VALUES, countsOf("status", filter.rules, searched, archiveSearched, true)),
    ...(isGroup ? [projectField(scoped, countsOf("project", filter.rules, searched, archiveSearched, true))] : []),
  ]
  const groups = [
    ...statusGroups(open, {
      readyByProject: false,
      body: (rows, label) => <BandGrid {...grid.band(treeRows(rows), label)} />,
    }),
    ...archiveGroups(archiveShown, (rows, label) => <BandGrid {...grid.band(rows, label)} />, archived),
  ]
  const total = located(lists, scoped, "").reduce((n, r) => n + changesOf(r), 0) + archiveAll.length
  const shown = open.reduce((n, r) => n + changesOf(r), 0) + archived.length

  // An address naming no project or group: the same page as an unknown workflow, prompt or change.
  if (projects !== null && entry === null) {
    const name = id.slice(id.indexOf(":") + 1)
    return (
      <PageUnknown
        title={name}
        message={
          <>
            No {id.startsWith("group:") ? "group" : "project"} <code className="font-mono">{name}</code>
          </>
        }
        back={{ label: "Back to All projects", href: to.projects() }}
      />
    )
  }

  return (
    <>
      <PageHeader
        title={entry?.label ?? ""}
        parent={group !== undefined ? { label: group.name, href: to.group(group.id) } : undefined}
      />
      <PageBody>
        {entry !== null ? (
          <FilterBar
            fields={fields}
            filter={filter}
            onChange={setFilter}
            searchLabel="Search changes"
            // Counts and empty states wait for every list: a list still loading reads as no change.
            shown={pending ? null : shown}
            total={pending ? null : total}
            noun="change"
          />
        ) : null}
        <ScrollBody>
          {sizer}
          {gate}
          {entry !== null && groups.length > 0 ? (
            <>
              <BandGrid {...grid.head} />
              <Groups page={id} groups={groups} />
              {limit !== null && archived.length > limit ? (
                <Button
                  variant="link"
                  nativeButton={false}
                  render={
                    <Link
                      href={
                        entry.kind === "project"
                          ? to.project(entry.keys[0] as string, { archive: true })
                          : to.group(entry.id.slice("group:".length), { archive: true })
                      }
                    />
                  }
                  className="mx-6 mt-3 h-auto px-0 text-link"
                >
                  All archived →
                </Button>
              ) : null}
              <ListFoot>
                <CollapseHint />
              </ListFoot>
            </>
          ) : null}
          {entry !== null && groups.length === 0 && !pending ? (
            isNarrowed(filter) ? (
              <NoMatch nouns="changes" filter={filter} fields={fields} onClear={() => setFilter(NO_FILTER)} />
            ) : (
              <EmptyNote inset="page">
                {all ? "Nothing archived yet." : "Nothing open, nothing archived yet."}
              </EmptyNote>
            )
          ) : null}
        </ScrollBody>
      </PageBody>
    </>
  )
}
