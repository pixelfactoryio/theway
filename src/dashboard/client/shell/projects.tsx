import { useQuery } from "@tanstack/react-query"
import { useLocation } from "wouter"
import type { z } from "zod"

import { ErrorBodySchema } from "@/lib/files"
import { currentKey, ProjectListSchema } from "@/lib/projects"
import { routeKeyOf } from "@/lib/routes"
import { unexpectedAnswer } from "@/shell/api"

/**
 * A JSON read of the API, parsed with `schema`: a non-2xx answer throws its `error` text, an answer `schema` does not
 * parse throws where and how it differs.
 */
export async function getJson<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  const res = await fetch(path, { headers: { Accept: "application/json" } })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const failure = ErrorBodySchema.safeParse(body)
    const error = failure.success ? failure.data.error : ""
    throw new Error(error !== "" ? error : `${res.status} ${res.statusText}`)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new Error(unexpectedAnswer(path, parsed.error))
  return parsed.data
}

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
