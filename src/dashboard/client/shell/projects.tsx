import { useLocation } from "wouter"

import { useProjects } from "@/data/queries"
import { currentKey } from "@/lib/projects"
import { routeKeyOf } from "@/lib/routes"

/** The current project's key once `GET /api/projects` has loaded, `null` while loading, after a failure or with no project. */
export function useCurrentKey(): string | null {
  const projects = useProjects()
  const [location] = useLocation()
  if (projects.data === undefined) return null
  return currentKey(projects.data, routeKeyOf(location))
}
