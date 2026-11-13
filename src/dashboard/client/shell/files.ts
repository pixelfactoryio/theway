import { useQuery } from "@tanstack/react-query"

import type { FileBody, PromptList, WorkflowList } from "@/lib/files"
import { fileApi } from "@/lib/files"
import { getJson, useProjects } from "@/shell/projects"

/** `GET /api/workflows`. */
export function useWorkflows() {
  return useQuery({ queryKey: ["workflows"], queryFn: () => getJson<WorkflowList>("/api/workflows") })
}

/** `GET /api/prompts`. */
export function usePrompts() {
  return useQuery({ queryKey: ["prompts"], queryFn: () => getJson<PromptList>("/api/prompts") })
}

/** A file's route: `GET /api/<kind>/global/<name>` or `…/projects/<key>/<name>`. */
export function useFile(kind: "workflows" | "prompts", project: string | null, name: string) {
  const path = fileApi(kind, project, name)
  return useQuery({ queryKey: ["file", path], queryFn: () => getJson<FileBody>(path) })
}

/** A project's label from `GET /api/projects`, its key while the list is not there or does not hold it. */
export function useLabel(): (key: string) => string {
  const projects = useProjects()
  return (key) => projects.data?.projects.find((p) => p.key === key)?.label ?? key
}
