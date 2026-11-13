import { useQuery } from "@tanstack/react-query"

import type { ChangeList } from "@/lib/changes"
import { getJson } from "@/shell/projects"

/** `GET /api/projects/:key/changes`; no request while `key` is `null`. */
export function useChanges(key: string | null) {
  return useQuery({
    queryKey: ["changes", key],
    queryFn: () => getJson<ChangeList>(`/api/projects/${key}/changes`),
    enabled: key !== null,
  })
}
