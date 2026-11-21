import { PageLoading, PageUnknown } from "@/components/page-states"
import { useChange, useLabel } from "@/data/queries"
import { to } from "@/lib/routes"
import { ActiveChange } from "@/pages/change/active"
import { ArchivedChange } from "@/pages/change/archived"
import { PageLoadError } from "@/shell/load-error"
import { ProjectMark } from "@/shell/project-mark"
import { PageBody, PageHeader } from "@/shell/top-bar"

/** The errors of a `404` on a change's route. */
const UNKNOWN = ["unknown change", "unknown archive folder"]

/**
 * `#/<key>/changes/<id>[/<tab>]` and `#/<key>/changes/archive/<dir>[/<tab>]`: a change's header, its tabs (its Markdown
 * files, then Tasks) and its right panel; an active change is edited in place.
 */
export function ChangePage({
  projectKey,
  id,
  dir,
  tab,
}: {
  projectKey: string
  id?: string
  dir?: string
  tab?: string
}) {
  const change = useChange(projectKey, dir !== undefined ? { dir } : { id: id ?? "" })

  const label = useLabel()(projectKey)
  const name = dir ?? id ?? ""

  // The path and the mono ID a change's page gives in its header.
  const head = {
    title: name,
    mono: true,
    icon: <ProjectMark label={label} className="size-4" />,
    parents: [{ label, href: to.project(projectKey) }],
  }
  if (change.isPending) return <PageLoading {...head} />
  if (change.isError) {
    if (UNKNOWN.includes(change.error.message)) {
      return (
        <PageUnknown
          {...head}
          message={
            <>
              No change <code className="font-mono text-xs">{name}</code> in {label}
            </>
          }
          back={{ label: `Back to ${label}`, href: to.project(projectKey) }}
        />
      )
    }
    return (
      <>
        <PageHeader {...head} />
        <PageBody>
          <PageLoadError what="this change" error={change.error} retry={() => void change.refetch()} />
        </PageBody>
      </>
    )
  }

  const data = change.data
  if (data.archived !== null) return <ArchivedChange projectKey={projectKey} data={data} tab={tab} />
  return <ActiveChange projectKey={projectKey} data={data} tab={tab} />
}
