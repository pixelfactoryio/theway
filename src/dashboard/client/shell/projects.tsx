import { useQuery } from "@tanstack/react-query"
import { useRoute } from "wouter"
import type { z } from "zod"

import { currentKey, ProjectListSchema } from "@/lib/projects"
import { unexpectedAnswer } from "@/shell/api"

/** The `localStorage` key of the last chosen project. */
const PROJECT_KEY = "theway-project"

/**
 * A JSON read of the API, parsed with `schema`: a non-2xx answer throws its `error` text, an answer `schema` does not
 * parse throws where and how it differs.
 */
export async function getJson<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  const res = await fetch(path, { headers: { Accept: "application/json" } })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = body !== null && typeof body === "object" && "error" in body ? String(body.error) : ""
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

export function storedProject(): string | null {
  try {
    return localStorage.getItem(PROJECT_KEY)
  } catch {
    return null
  }
}

export function storeProject(key: string): void {
  try {
    localStorage.setItem(PROJECT_KEY, key)
  } catch {
    // Without storage, `#/` falls back to the start project.
  }
}

/** The key of the `#/<key>/changes…` and `#/<key>` routes, `null` on any other route. */
export function useRouteKey(): string | null {
  const [changes, c] = useRoute<{ key: string }>("/:key/changes/*?")
  const [overview, o] = useRoute<{ key: string }>("/:key")
  if (changes) return c.key
  return overview ? o.key : null
}

/** The current project's key once `GET /api/projects` has loaded, `null` while loading, after a failure or with no project. */
export function useCurrentKey(): string | null {
  const projects = useProjects()
  const routeKey = useRouteKey()
  if (projects.data === undefined) return null
  return currentKey(projects.data, routeKey, storedProject())
}
