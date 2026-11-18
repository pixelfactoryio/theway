/** The projects `GET /api/projects` lists, and the choice of the current one. Pure: no React, no DOM. */
import type { Project, ProjectList } from "../../contract"
import { byText } from "../../../core/text"

export type { Project } from "../../contract"
export { ProjectListSchema } from "../../contract"

/** Orders projects by label (`localeCompare`, `"en"`, `sensitivity: "base"`), ties broken by key. */
export function byLabel(projects: readonly Project[]): Project[] {
  return [...projects].sort(
    (a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }) || byText(a.key, b.key),
  )
}

/**
 * The current project's key: `routeKey` when it is listed; else `start` when listed; else the first project by label.
 * `null` with no project.
 */
export function currentKey(list: ProjectList, routeKey: string | null): string | null {
  const listed = (key: string | null): key is string => key !== null && list.projects.some((p) => p.key === key)
  if (listed(routeKey)) return routeKey
  if (listed(list.start)) return list.start
  return byLabel(list.projects)[0]?.key ?? null
}

/** The address of a change's page: `/<key>/changes/<id>?`, its `?` clearing the search part. */
export const changePath = (key: string, id: string): string => `/${key}/changes/${id}?`

/** The address of a project with no tab open: `/<key>?`, its `?` clearing the search part. */
export const projectPath = (key: string): string => `/${key}?`

/** The address of an archived change's page: `/<key>/changes/archive/<dir>?`, its `?` clearing the search part. */
export const archivePath = (key: string, dir: string): string => `/${key}/changes/archive/${encodeURIComponent(dir)}?`
