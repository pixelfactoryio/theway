import type { ColumnSizingState } from "@tanstack/react-table"
import { useMemo, useState } from "react"

import { BandGrid } from "@/components/band-grid"
import { EmptyNote } from "@/components/empty-note"
import { FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { CollapseHint } from "@/components/group-band"
import { LIST_CAP, useSpare } from "@/components/list-grid"
import {
  archiveGroups,
  projectField,
  STATUS_VALUES,
  statusField,
  statusGroups,
  useChangeGrid,
} from "@/components/workspace-bands"
import { Groups, ScrollBody, useProjectsGate } from "@/components/workspace-rows"
import { useChangeLists } from "@/data/queries"
import { rowStatus } from "@/lib/changes"
import { isNarrowed, NO_FILTER, passesAll, picks } from "@/lib/list-filter"
import {
  archivedValues,
  archivesMatching,
  archivesOf,
  changesOf,
  countOf,
  countsOf,
  located,
  locatedValues,
  treeRows,
} from "@/lib/workspace"
import { PageBody, PageHeader } from "@/shell/top-bar"

const NOW_FIELDS = ["project", "status"] as const

/**
 * `#/`: every project's changes in focus order: Invalid, In progress, Not started, Ready to archive counted. With
 * Status is Archived, every project's archived changes too, by month.
 */
export function NowPage() {
  const { projects, gate } = useProjectsGate()
  const list = useMemo(() => projects ?? [], [projects])
  const keys = list.map((p) => p.key)
  const { lists, failed, pending } = useChangeLists(keys)
  const [filter, setFilter] = useListFilter("now", NOW_FIELDS)
  const [sizing, setSizing] = useState<ColumnSizingState>({})
  const { spare, sizer } = useSpare(LIST_CAP.changes)
  const searched = located(lists, list, filter.q)
  const kept = searched.filter((r) => passesAll(r, filter.rules, locatedValues))
  // The progress column stands only over an open change listed as a row: the archive has none, and Ready to archive
  // is counted by project here.
  const progress = kept.some((r) => rowStatus(r.row) !== "ready")
  const grid = useChangeGrid(sizing, setSizing, { project: true, progress, spare })
  // The archive is listed only once Status is Archived; its count is in the Status menu all along.
  const withArchive = picks(filter.rules, "status", "archived")
  const archiveAll = archivesOf(lists, keys)
  const archiveSearched = archivesMatching(archiveAll, filter.q)
  const archived = withArchive ? archiveSearched.filter((r) => passesAll(r, filter.rules, archivedValues)) : []
  const fields = [
    projectField(
      list.filter((p) => p.active > 0 || (withArchive && (lists.get(p.key)?.archived.length ?? 0) > 0)),
      countsOf("project", filter.rules, searched, archiveSearched, withArchive),
    ),
    statusField(STATUS_VALUES, countsOf("status", filter.rules, searched, archiveSearched, true)),
  ]
  const groups = [
    ...statusGroups(kept, {
      readyByProject: true,
      body: (rows, label) => <BandGrid {...grid.band(treeRows(rows), label)} />,
    }),
    ...archiveGroups(archived, (rows, label) => <BandGrid {...grid.band(rows, label)} />),
  ]
  const open = located(lists, list, "").reduce((n, r) => n + changesOf(r), 0)
  const settled = projects !== null && !pending
  return (
    <>
      <PageHeader title="Now" />
      <PageBody>
        <FilterBar
          fields={fields}
          filter={filter}
          onChange={setFilter}
          searchLabel="Search changes"
          // Counts and empty states wait for every list: a list still loading reads as no change.
          shown={settled ? kept.reduce((n, r) => n + changesOf(r), 0) + archived.length : null}
          total={settled ? open + (withArchive ? archiveAll.length : 0) : null}
          noun="change"
        />
        <ScrollBody>
          {sizer}
          {gate}
          {failed.length > 0 ? (
            <EmptyNote tone="error" inset="page">
              Could not load the changes of {countOf(failed.length, "project")}.
            </EmptyNote>
          ) : null}
          {groups.length > 0 ? (
            <>
              <BandGrid {...grid.head} />
              <Groups page="now" groups={groups} />
              <CollapseHint />
            </>
          ) : !settled ? null : isNarrowed(filter) ? (
            <NoMatch nouns="changes" filter={filter} fields={fields} onClear={() => setFilter(NO_FILTER)} />
          ) : (
            <EmptyNote inset="page">Nothing open.</EmptyNote>
          )}
        </ScrollBody>
      </PageBody>
    </>
  )
}
