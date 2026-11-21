import { ArrowRightIcon, FolderIcon, FoldersIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "wouter"

import { EmptyNote } from "@/components/empty-note"
import { FilterBar, NoMatch, useListFilter } from "@/components/filter-bar"
import { CollapseHint } from "@/components/group-band"
import { ListFoot } from "@/components/list-grid"
import { ListHead, NavList } from "@/components/list-kit"
import { PageUnknown } from "@/components/page-states"
import { PinButton } from "@/components/pin-button"
import { Button } from "@/components/ui/button"
import { ViewTabs } from "@/components/view-tabs"
import {
  archiveGroups,
  changeColumns,
  projectField,
  STATUS_VALUES,
  statusField,
  statusGroups,
} from "@/components/workspace-bands"
import { ScrollBody, Sections, useProjectsGate } from "@/components/workspace-rows"
import { useChangeLists, useSettings, useWrites } from "@/data/queries"
import { isNarrowed, NO_FILTER, passesAll } from "@/lib/list-filter"
import { to } from "@/lib/routes"
import {
  archivedValues,
  archivesMatching,
  archivesOf,
  changesOf,
  countsOf,
  entryOf,
  listsOpenRow,
  located,
  locatedValues,
  togglePin,
} from "@/lib/workspace"
import { ProjectMark } from "@/shell/project-mark"
import { recordedId, useRecordVisit } from "@/shell/settings"
import { StateLoading } from "@/shell/state"
import { PageBody, PageHeader } from "@/shell/top-bar"

const SCOPE_FIELDS = ["status", "project"] as const

/**
 * A project's or a group's page (`#/<key>`, `#/group/<id>`): its open changes by status, then its archive by month
 * (the twelve newest); its Archive view (`?archive`) lists the whole archive. Its header holds its path, the star that
 * pins it (a project in a group is pinned through its group, so has none) and its two views. Opening it records it
 * among the recently opened.
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
  const isGroup = entry?.kind === "group"
  const edit = useWrites().editSettings
  const [saveError, setSaveError] = useState<string | null>(null)
  const scoped = list.filter((p) => keys.includes(p.key))

  const searched = all ? [] : located(lists, scoped, filter.q)
  const open = searched.filter((r) => passesAll(r, filter.rules, locatedValues))
  // A group's page names each row's project, in its open bands and its archive bands alike: they share one header.
  // The progress column stands only over an open change: a list of archived changes alone has none.
  const archiveAll = archivesOf(lists, keys)
  const archiveSearched = archivesMatching(archiveAll, filter.q)
  const archived = archiveSearched.filter((r) => passesAll(r, filter.rules, archivedValues))
  const columns = changeColumns({
    project: isGroup,
    progress: listsOpenRow(open, false),
    dates: archived.length > 0,
  })
  const limit = all || isNarrowed(filter) ? null : 12
  const archiveShown = limit === null ? archived : archived.slice(0, limit)

  const fields = [
    statusField(all ? ["archived"] : STATUS_VALUES, countsOf("status", filter.rules, searched, archiveSearched, true)),
    ...(isGroup ? [projectField(scoped, countsOf("project", filter.rules, searched, archiveSearched, true))] : []),
  ]
  const groups = [
    ...statusGroups(open, { readyByProject: false, columns }),
    ...archiveGroups(archiveShown, columns, archived),
  ]
  const openTotal = located(lists, scoped, "").reduce((n, r) => n + changesOf(r), 0)
  const total = openTotal + archiveAll.length
  const shown = open.reduce((n, r) => n + changesOf(r), 0) + archived.length

  // An address naming no project or group: the same page as an unknown workflow, prompt or change.
  const Icon = id.startsWith("group:") ? FoldersIcon : FolderIcon
  if (projects !== null && entry === null) {
    const name = id.slice(id.indexOf(":") + 1)
    return (
      <PageUnknown
        title={name}
        icon={Icon}
        message={
          <>
            No {id.startsWith("group:") ? "group" : "project"} <code className="font-mono">{name}</code>
          </>
        }
        back={{ label: "Back to All projects", href: to.projects() }}
      />
    )
  }

  const href = (archive: boolean) =>
    entry === null
      ? ""
      : entry.kind === "project"
        ? to.project(entry.keys[0] as string, { archive })
        : to.group(entry.id.slice("group:".length), { archive })
  // A project in a group is pinned through its group: its page has no star.
  const pinnable = entry !== null && group === undefined
  const pinned = entry !== null && settings.pinned.includes(entry.id)
  const pin = () => {
    if (entry === null) return
    setSaveError(null)
    edit((s) => togglePin(s, entry.id)).catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)))
  }

  return (
    <>
      <PageHeader
        title={entry?.label ?? ""}
        icon={
          entry === null ? Icon : <ProjectMark label={entry.label} group={id.startsWith("group:")} className="size-4" />
        }
        parents={[
          { label: "All projects", href: to.projects() },
          ...(group !== undefined ? [{ label: group.name, href: to.group(group.id) }] : []),
        ]}
        lead={pinnable ? <PinButton pinned={pinned} label={entry.label} onToggle={pin} /> : undefined}
        tabs={
          entry !== null ? (
            <ViewTabs
              label="Views"
              value={all ? "archive" : "changes"}
              tabs={[
                { value: "changes", label: "Changes", href: href(false) },
                { value: "archive", label: "Archive", href: href(true) },
              ]}
            />
          ) : undefined
        }
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
        {saveError !== null ? <EmptyNote tone="error">Could not save: {saveError}</EmptyNote> : null}
        <ScrollBody>
          {gate}
          {entry !== null && groups.length > 0 ? (
            <>
              {!all && !pending && openTotal === 0 ? <EmptyNote>No open change</EmptyNote> : null}
              <ListHead name="Change" columns={columns} />
              <NavList>
                <Sections page={id} groups={groups} />
              </NavList>
              {limit !== null && archived.length > limit ? (
                <Button
                  variant="link"
                  nativeButton={false}
                  render={<Link href={href(true)} />}
                  className="mt-2 h-auto gap-1 px-4 text-link"
                >
                  All archived
                  <ArrowRightIcon aria-hidden="true" />
                </Button>
              ) : null}
              <ListFoot>
                <CollapseHint />
              </ListFoot>
            </>
          ) : null}
          {entry !== null && groups.length === 0 && pending && gate === null ? <StateLoading size="page" /> : null}
          {entry !== null && groups.length === 0 && !pending ? (
            isNarrowed(filter) ? (
              <NoMatch nouns="changes" filter={filter} fields={fields} onClear={() => setFilter(NO_FILTER)} />
            ) : (
              <EmptyNote size="page">{all ? "Nothing archived yet." : "Nothing open, nothing archived yet."}</EmptyNote>
            )
          ) : null}
        </ScrollBody>
      </PageBody>
    </>
  )
}
