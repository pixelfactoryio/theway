import { Clock3Icon } from "lucide-react"
import { useMemo } from "react"

import { EmptyNote } from "@/components/empty-note"
import { FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { CollapseHint } from "@/components/group-band"
import { ListFoot } from "@/components/list-grid"
import { ListHead, NavList } from "@/components/list-kit"
import {
  archiveGroups,
  changeColumns,
  projectField,
  STATUS_VALUES,
  statusField,
  statusGroups,
} from "@/components/workspace-bands"
import { ScrollBody, Sections, useProjectsGate } from "@/components/workspace-rows"
import { useChangeLists } from "@/data/queries"
import { isNarrowed, NO_FILTER, passesAll, picks } from "@/lib/list-filter"
import {
  archivedValues,
  archivesMatching,
  archivesOf,
  changesOf,
  countOf,
  countsOf,
  listsOpenRow,
  located,
  locatedValues,
  noneLoaded,
} from "@/lib/workspace"
import { StateLoading } from "@/shell/state"
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
  const searched = located(lists, list, filter.q)
  const kept = searched.filter((r) => passesAll(r, filter.rules, locatedValues))
  // The progress column stands only over an open change listed as a row: the archive has none, and Ready to archive
  // is counted by project here.
  const progress = listsOpenRow(kept, true)
  // The archive is listed only once Status is Archived; its count is in the Status menu all along.
  const withArchive = picks(filter.rules, "status", "archived")
  const archiveAll = archivesOf(lists, keys)
  const archiveSearched = archivesMatching(archiveAll, filter.q)
  const archived = withArchive ? archiveSearched.filter((r) => passesAll(r, filter.rules, archivedValues)) : []
  const columns = changeColumns({
    project: true,
    progress,
    dates: archived.length > 0,
    archivedOnly: kept.length === 0 && archived.length > 0,
  })
  const fields = [
    projectField(
      list.filter((p) => p.active > 0 || (withArchive && (lists.get(p.key)?.archived.length ?? 0) > 0)),
      countsOf("project", filter.rules, searched, archiveSearched, withArchive),
    ),
    statusField(STATUS_VALUES, countsOf("status", filter.rules, searched, archiveSearched, true)),
  ]
  const groups = [...statusGroups(kept, { readyByProject: true, columns }), ...archiveGroups(archived, columns)]
  const open = located(lists, list, "").reduce((n, r) => n + changesOf(r), 0)
  const settled = projects !== null && !pending
  // With no list loaded, the load error stands alone: nothing is known to be empty.
  const unread = noneLoaded(failed.length, lists.size)
  return (
    <>
      <PageHeader title="Now" icon={Clock3Icon} />
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
          {gate}
          {failed.length > 0 ? (
            <EmptyNote tone="error">Could not load the changes of {countOf(failed.length, "project")}.</EmptyNote>
          ) : null}
          {groups.length > 0 ? (
            <>
              <ListHead name="Change" columns={columns} />
              <NavList>
                <Sections page="now" groups={groups} />
              </NavList>
              <ListFoot>
                <CollapseHint />
              </ListFoot>
            </>
          ) : unread ? null : !settled ? (
            // The projects' own loading line is the gate's; then the lists'.
            gate === null ? (
              <StateLoading size="page" />
            ) : null
          ) : isNarrowed(filter) ? (
            <NoMatch nouns="changes" filter={filter} fields={fields} onClear={() => setFilter(NO_FILTER)} />
          ) : (
            <EmptyNote size="page">Nothing open.</EmptyNote>
          )}
        </ScrollBody>
      </PageBody>
    </>
  )
}
