import { PageLoading, PageUnknown } from "@/components/page-states"
import { useChange, useLabel } from "@/data/queries"
import { to } from "@/lib/routes"
import { ActiveChange } from "@/pages/change/active"
import { ArchivedChange } from "@/pages/change/archived"
import { PageLoadError } from "@/shell/load-error"
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

  if (change.isPending) return <PageLoading title={name} />
  if (change.isError) {
    if (UNKNOWN.includes(change.error.message)) {
      return (
        <PageUnknown
          title={name}
          message={
            <>
              No change <code className="font-mono">{name}</code> in {label}
            </>
          }
          back={{ label: `Back to ${label}`, href: to.project(projectKey) }}
        />
      )
    }
    return (
      <>
        <PageHeader title={name} />
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
