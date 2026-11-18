import type { ReactNode } from "react"
import { Redirect, useRoute } from "wouter"

import { projectPath } from "@/lib/projects"
import { ChangePage } from "@/pages/change"
import { NoProjectPage } from "@/pages/section"
import { LoadError } from "@/shell/load-error"
import { useProjects } from "@/shell/projects"
import { PageBody, TopBar } from "@/shell/top-bar"

/**
 * What `#/` and a project's pages show until the projects are known: an empty content area while they load, the load
 * error after a failure. `null` once loaded.
 */
function ProjectsGate({ label }: { label: string }) {
  const projects = useProjects()
  if (projects.isPending) {
    return (
      <>
        <TopBar title={label} />
        <PageBody>{null}</PageBody>
      </>
    )
  }
  if (projects.isError) {
    return (
      <>
        <TopBar title={label} />
        <PageBody>
          <LoadError
            what="the projects"
            error={projects.error}
            retry={() => void projects.refetch()}
            className="m-4 w-auto"
          />
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
  if (!listed) return <Redirect to="/?" replace />
  return null
}

/**
 * `#/<key>/changes…`: a listed key's changes, or one change (`…/archive/<dir>[/<tab>]` matched before
 * `…/<id>[/<tab>]`); an unknown key goes to `#/` with `replace`.
 */
export function ChangesRoute({ routeKey }: { routeKey: string }) {
  const gate = useListedGate(routeKey, "Changes")
  const [archived, a] = useRoute<{ dir: string; tab?: string }>("/:key/changes/archive/:dir/:tab?")
  const [active, c] = useRoute<{ id: string; tab?: string }>("/:key/changes/:id/:tab?")
  if (gate !== null) return gate
  if (archived) return <ChangePage key={`${routeKey}/archive/${a.dir}`} projectKey={routeKey} dir={a.dir} tab={a.tab} />
  if (active) return <ChangePage key={`${routeKey}/${c.id}`} projectKey={routeKey} id={c.id} tab={c.tab} />
  return <Redirect to={projectPath(routeKey)} replace />
}
