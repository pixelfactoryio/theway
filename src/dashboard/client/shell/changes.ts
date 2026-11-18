import { useQueries } from "@tanstack/react-query"

import { getJson } from "@/data/api"
import { ChangeListSchema } from "@/lib/changes"

/** `GET /api/projects/:key/changes` of each of `keys`, in their order: each `undefined` while it loads or after a failure. */
export function useChangesOf(keys: readonly string[]) {
  return useQueries({
    queries: keys.map((key) => ({
      queryKey: ["changes", key],
      queryFn: () => getJson(`/api/projects/${key}/changes`, ChangeListSchema),
    })),
  })
}
