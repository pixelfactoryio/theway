import { useQuery } from "@tanstack/react-query"
import { useCallback } from "react"

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

/**
 * A project's label from `GET /api/projects`, its key while the list is not there or does not hold it. The function
 * keeps its identity until the list changes: the tables build their columns from it, and new columns remount every
 * cell, each of which would mount a new `GET /api/projects` observer and refetch the list.
 */
export function useLabel(): (key: string) => string {
  const data = useProjects().data
  return useCallback((key: string) => data?.projects.find((p) => p.key === key)?.label ?? key, [data])
}
