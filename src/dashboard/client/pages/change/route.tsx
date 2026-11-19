import type { ReactNode } from "react"
import { Redirect, useRoute } from "wouter"

import { useProjects } from "@/data/queries"
import { CHANGE_ROUTES, decoded, to } from "@/lib/routes"
import { ChangePage } from "@/pages/change/change"
import { NoProjectPage } from "@/components/no-project"
import { PageLoading } from "@/components/page-states"
import { PageLoadError } from "@/shell/load-error"
import { PageBody, PageHeader } from "@/shell/top-bar"

/**
 * What `#/` and a project's pages show until the projects are known: an empty content area while they load, the load
 * error after a failure. `null` once loaded.
 */
function ProjectsGate({ label }: { label: string }) {
  const projects = useProjects()
  if (projects.isPending) return <PageLoading title={label} />
  if (projects.isError) {
    return (
      <>
        <PageHeader title={label} />
        <PageBody>
          <PageLoadError what="the projects" error={projects.error} retry={() => void projects.refetch()} />
        </PageBody>
      </>
    )
  }
  return null
}

/**
 * The gate of a project's route: `ProjectsGate` until the projects are known, the no-project page with none, `#/` with
 * `replace` for a key not listed; `null` once the key is listed.
 */
function useListedGate(routeKey: string, label: string): ReactNode {
  const projects = useProjects()
  const listed = projects.data?.projects.some((p) => p.key === routeKey) === true

  if (projects.data === undefined) return <ProjectsGate label={label} />
  if (projects.data.projects.length === 0) return <NoProjectPage />
  if (!listed) return <Redirect to={to.now()} replace />
  return null
}

/**
 * `#/<key>/changes…`: a listed key's changes, or one change (`…/archive/<dir>[/<tab>]` matched before
 * `…/<id>[/<tab>]`); an unknown key goes to `#/` with `replace`.
 */
export function ChangesRoute({ routeKey }: { routeKey: string }) {
  const gate = useListedGate(routeKey, "Changes")
  const [archived, a] = useRoute(CHANGE_ROUTES.archived)
  const [active, c] = useRoute(CHANGE_ROUTES.change)
  if (gate !== null) return gate
  if (archived) {
    const { dir = "", tab } = decoded(a)
    return <ChangePage key={`${routeKey}/archive/${dir}`} projectKey={routeKey} dir={dir} tab={tab} />
  }
  if (active) {
    const { id = "", tab } = decoded(c)
    return <ChangePage key={`${routeKey}/${id}`} projectKey={routeKey} id={id} tab={tab} />
  }
  return <Redirect to={to.project(routeKey)} replace />
}
