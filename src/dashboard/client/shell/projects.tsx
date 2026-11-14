import { useQuery } from "@tanstack/react-query"
import { useRoute } from "wouter"

import { currentKey, type ProjectList } from "@/lib/projects"

/** The `localStorage` key of the last chosen project. */
const PROJECT_KEY = "theway-project"

/** A JSON read of the API; a non-2xx answer throws its `error` text. */
export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = body !== null && typeof body === "object" && "error" in body ? String(body.error) : ""
    throw new Error(error !== "" ? error : `${res.status} ${res.statusText}`)
  }
  return body as T
}

/** `GET /api/projects`. */
export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: () => getJson<ProjectList>("/api/projects") })
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
