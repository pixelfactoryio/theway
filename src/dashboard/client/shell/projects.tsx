import { useQuery } from "@tanstack/react-query"
import { useLocation } from "wouter"

import { getJson } from "@/data/api"
import { currentKey, ProjectListSchema } from "@/lib/projects"
import { routeKeyOf } from "@/lib/routes"

/** `GET /api/projects`. */
export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: () => getJson("/api/projects", ProjectListSchema) })
}

/** The current project's key once `GET /api/projects` has loaded, `null` while loading, after a failure or with no project. */
export function useCurrentKey(): string | null {
  const projects = useProjects()
  const [location] = useLocation()
  if (projects.data === undefined) return null
  return currentKey(projects.data, routeKeyOf(location))
}
