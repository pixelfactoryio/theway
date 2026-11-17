import { useQueries, useQuery } from "@tanstack/react-query"

import { ChangeListSchema } from "@/lib/changes"
import { getJson } from "@/shell/projects"

/** `GET /api/projects/:key/changes`; no request while `key` is `null`. */
export function useChanges(key: string | null) {
  return useQuery({
    queryKey: ["changes", key],
    queryFn: () => getJson(`/api/projects/${key}/changes`, ChangeListSchema),
    enabled: key !== null,
  })
}

/** `GET /api/projects/:key/changes` of each of `keys`, in their order: each `undefined` while it loads or after a failure. */
export function useChangesOf(keys: readonly string[]) {
  return useQueries({
    queries: keys.map((key) => ({
      queryKey: ["changes", key],
      queryFn: () => getJson(`/api/projects/${key}/changes`, ChangeListSchema),
    })),
  })
}
