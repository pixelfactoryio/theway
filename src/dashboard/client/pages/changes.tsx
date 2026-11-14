import { useEffect } from "react"
import { Redirect, useRoute } from "wouter"

import { overviewPath } from "@/lib/projects"
import { ChangePage } from "@/pages/change"
import { ChangesPage } from "@/pages/changes-list"
import { OverviewPage } from "@/pages/overview"
import { NoProjectPage } from "@/pages/section"
import { LoadError } from "@/shell/load-error"
import { storeProject, useCurrentKey, useProjects } from "@/shell/projects"
import { PageBody, TopBar } from "@/shell/top-bar"

/**
 * What `#/`, the Overview and the Changes pages show until the projects are known: the selector's skeleton then the
 * breadcrumb `label` and an empty content area while they load, `label` alone and the load error after a failure.
 * `null` once loaded.
 */
function ProjectsGate({ label }: { label: string }) {
  const projects = useProjects()
  if (projects.isPending) {
    return (
      <>
        <TopBar items={[{ selector: true }, { label }]} />
        <PageBody>{null}</PageBody>
      </>
    )
  }
  if (projects.isError) {
    return (
      <>
        <TopBar items={[{ label }]} />
        <PageBody>
          <LoadError what="the projects" error={projects.error} retry={() => void projects.refetch()} className="m-4 w-auto" />
        </PageBody>
      </>
    )
  }
  return null
}

/** `#/`: opens the current project's Overview, with `replace`. */
export function HomeRoute() {
  const projects = useProjects()
  const current = useCurrentKey()
  if (projects.data === undefined) return <ProjectsGate label="Overview" />
  if (current === null) return <NoProjectPage />
  return <Redirect to={overviewPath(current)} replace />
}

/** `#/<key>`: a listed key's Overview; an unknown key goes to `#/` with `replace`. */
export function OverviewRoute({ routeKey }: { routeKey: string }) {
  const projects = useProjects()
  const listed = projects.data?.projects.some((p) => p.key === routeKey) === true

  useEffect(() => {
    if (listed) storeProject(routeKey)
  }, [listed, routeKey])

  if (projects.data === undefined) return <ProjectsGate label="Overview" />
  if (projects.data.projects.length === 0) return <NoProjectPage />
  if (!listed) return <Redirect to="/?" replace />
  return <OverviewPage projectKey={routeKey} />
}

/**
 * `#/<key>/changes…`: a listed key's changes, or one change (`…/archive/<dir>[/<tab>]` matched before
 * `…/<id>[/<tab>]`); an unknown key goes to `#/` with `replace`.
 */
export function ChangesRoute({ routeKey }: { routeKey: string }) {
  const projects = useProjects()
  const [archived, a] = useRoute<{ dir: string; tab?: string }>("/:key/changes/archive/:dir/:tab?")
  const [active, c] = useRoute<{ id: string; tab?: string }>("/:key/changes/:id/:tab?")
  const listed = projects.data?.projects.some((p) => p.key === routeKey) === true

  useEffect(() => {
    if (listed) storeProject(routeKey)
  }, [listed, routeKey])

  if (projects.data === undefined) return <ProjectsGate label="Changes" />
  if (projects.data.projects.length === 0) return <NoProjectPage />
  if (!listed) return <Redirect to="/?" replace />
  if (archived) return <ChangePage key={`${routeKey}/archive/${a.dir}`} projectKey={routeKey} dir={a.dir} tab={a.tab} />
  if (active) return <ChangePage key={`${routeKey}/${c.id}`} projectKey={routeKey} id={c.id} tab={c.tab} />
  return <ChangesPage projectKey={routeKey} />
}
