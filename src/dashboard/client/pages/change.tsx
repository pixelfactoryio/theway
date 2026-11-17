import { useQuery } from "@tanstack/react-query"
import { Link } from "wouter"

import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ChangeDetailSchema } from "@/lib/changes"
import { projectPath } from "@/lib/projects"
import { ActiveChange } from "@/pages/active-change"
import { ArchivedChange } from "@/pages/archived-change"
import { LoadError } from "@/shell/load-error"
import { getJson, useProjects } from "@/shell/projects"
import { PageBody } from "@/shell/top-bar"
import { PageHeader } from "@/components/doc-frame"

/** The errors of a `404` on a change's route. */
const UNKNOWN = ["unknown change", "unknown archive folder"]

/** The unknown change, or unknown archive folder, state. */
function Unknown({ projectKey, name }: { projectKey: string; name: string }) {
  const projects = useProjects()
  const label = projects.data?.projects.find((p) => p.key === projectKey)?.label ?? projectKey
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          No change <code className="font-mono">{name}</code> in {label}
        </EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link href={projectPath(projectKey)} />}>
          Back to {label}
        </Button>
      </EmptyContent>
    </Empty>
  )
}

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
  const path =
    dir !== undefined
      ? `/api/projects/${projectKey}/changes/archive/${dir}`
      : `/api/projects/${projectKey}/changes/${id}`
  const change = useQuery({ queryKey: ["change", path], queryFn: () => getJson(path, ChangeDetailSchema) })

  const name = dir ?? id ?? ""

  if (change.isPending) {
    return (
      <>
        <PageHeader title={name} />
        <PageBody>{null}</PageBody>
      </>
    )
  }
  if (change.isError) {
    const unknown = UNKNOWN.includes(change.error.message)
    return (
      <>
        <PageHeader title={name} />
        <PageBody>
          {unknown ? (
            <Unknown projectKey={projectKey} name={name} />
          ) : (
            <LoadError
              what="this change"
              error={change.error}
              retry={() => void change.refetch()}
              className="m-4 w-auto"
            />
          )}
        </PageBody>
      </>
    )
  }

  const data = change.data
  if (data.archived !== null) return <ArchivedChange projectKey={projectKey} data={data} tab={tab} />
  return <ActiveChange projectKey={projectKey} data={data} tab={tab} />
}
