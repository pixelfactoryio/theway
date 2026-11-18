import { useMemo } from "react"

import { EmptyNote } from "@/components/empty-note"
import { FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { CollapseHint } from "@/components/group-band"
import { archiveGroups, projectField, STATUS_VALUES, statusField, statusGroups } from "@/components/workspace-bands"
import { Groups, ScrollBody, useNow, useProjectsGate } from "@/components/workspace-rows"
import { useChangeLists, useLabel } from "@/data/queries"
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
} from "@/lib/workspace"
import { PageBody, PageHeader } from "@/shell/top-bar"

const NOW_FIELDS = ["project", "status"] as const

/**
 * `#/`: every project's changes in focus order: needs fixing, In progress, Not started, Ready to archive counted. With
 * Status is Archived, every project's archived changes too, by month.
 */
export function NowPage() {
  const { projects, gate } = useProjectsGate()
  const list = useMemo(() => projects ?? [], [projects])
  const keys = list.map((p) => p.key)
  const { lists, failed } = useChangeLists(keys)
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
  const fields = [
    projectField(
      list.filter((p) => p.active > 0 || (withArchive && (lists.get(p.key)?.archived.length ?? 0) > 0)),
      countsOf("project", filter.rules, searched, archiveSearched, withArchive),
    ),
    statusField(STATUS_VALUES, countsOf("status", filter.rules, searched, archiveSearched, true)),
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
            <EmptyNote tone="error" inset="page">
              Could not load the changes of {countOf(failed.length, "project")}.
            </EmptyNote>
          ) : null}
          {groups.length > 0 ? (
            <>
              <Groups page="now" groups={groups} />
              <CollapseHint />
            </>
          ) : projects === null ? null : isNarrowed(filter) ? (
            <NoMatch nouns="changes" filter={filter} fields={fields} onClear={() => setFilter(NO_FILTER)} />
          ) : (
            <EmptyNote inset="page">Nothing open.</EmptyNote>
          )}
        </ScrollBody>
      </PageBody>
    </>
  )
}
