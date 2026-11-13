import { useEffect } from "react"
import { Redirect } from "wouter"

import { changesPath } from "@/lib/projects"
import { NoProjectPage, SectionPage } from "@/pages/section"
import { LoadError } from "@/shell/load-error"
import { storeProject, useCurrentKey, useProjects } from "@/shell/projects"
import { PageBody, TopBar } from "@/shell/top-bar"

/**
 * What `#/` and the Changes pages show until the projects are known: the breadcrumb "Changes" with the selector's
 * skeleton and an empty content area while they load, "Changes" alone and the load error after a failure. `null`
 * once loaded.
 */
function ProjectsGate() {
  const projects = useProjects()
  if (projects.isPending) {
    return (
      <>
        <TopBar items={[{ label: "Changes" }, { selector: true }]} />
        <PageBody>{null}</PageBody>
      </>
    )
  }
  if (projects.isError) {
    return (
      <>
        <TopBar items={[{ label: "Changes" }]} />
        <PageBody>
          <LoadError what="the projects" error={projects.error} retry={() => void projects.refetch()} className="m-4 w-auto" />
        </PageBody>
      </>
    )
  }
  return null
}

/** `#/`: opens the current project's changes, with `replace`. */
export function HomeRoute() {
  const projects = useProjects()
  const current = useCurrentKey()
  if (projects.data === undefined) return <ProjectsGate />
  if (current === null) return <NoProjectPage />
  return <Redirect to={changesPath(current)} replace />
}

/** `#/<key>/changes…`: a listed key's changes; an unknown key goes to `#/` with `replace`. */
export function ChangesRoute({ routeKey }: { routeKey: string }) {
  const projects = useProjects()
  const listed = projects.data?.projects.some((p) => p.key === routeKey) === true

  useEffect(() => {
    if (listed) storeProject(routeKey)
  }, [listed, routeKey])

  if (projects.data === undefined) return <ProjectsGate />
  if (projects.data.projects.length === 0) return <NoProjectPage />
  if (!listed) return <Redirect to="/?" replace />
  return <SectionPage title="Changes" items={[{ label: "Changes" }, { selector: true }]} />
}
