import { useQuery } from "@tanstack/react-query"

import type { ChangeList } from "@/lib/changes"
import { getJson } from "@/shell/projects"

/** `GET /api/projects/:key/changes`. */
export function useChanges(key: string) {
  return useQuery({ queryKey: ["changes", key], queryFn: () => getJson<ChangeList>(`/api/projects/${key}/changes`) })
}
