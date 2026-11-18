import { type QueryClient, type QueryKey, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"

import { type DashboardSettings, DashboardSettingsSchema } from "../../contract"
import { failureOf, getJson, type Sent, sendJson } from "@/data/api"
import { type ChangeList, ChangeDetailSchema, ChangeListSchema } from "@/lib/changes"
import {
  CheckBodySchema,
  FileBodySchema,
  PromptListSchema,
  SavedSchema,
  VersionListSchema,
  VersionTextSchema,
  WorkflowListSchema,
} from "@/lib/files"
import { ProjectListSchema } from "@/lib/projects"
import type { FileKind } from "@/lib/routes"

export type { DashboardSettings } from "../../contract"

const enc = encodeURIComponent

/** A file's API route: `/api/<kind>/global/<name>` or `/api/<kind>/projects/<key>/<name>`. */
const fileOf = (kind: FileKind, project: string | null, name: string): string =>
  project === null ? `/api/${kind}/global/${enc(name)}` : `/api/${kind}/projects/${enc(project)}/${enc(name)}`

/** The versions of the file at the API route `file`. */
const historyOf = (file: string): string => `${file}/history`

/** The version `id` of the file at the API route `file`. */
const versionOf = (file: string, id: string): string => `${historyOf(file)}/${enc(id)}`

/** A change's API route. */
const changeOf = (key: string, id: string): string => `/api/projects/${enc(key)}/changes/${enc(id)}`

/** Every API route the client reads or writes, each parameter encoded. */
export const apiPath = {
  projects: "/api/projects",
  changes: (key: string): string => `/api/projects/${enc(key)}/changes`,
  change: changeOf,
  archived: (key: string, dir: string): string => `/api/projects/${enc(key)}/changes/archive/${enc(dir)}`,
  changeFile: (key: string, id: string, name: string): string => `${changeOf(key, id)}/files/${enc(name)}`,
  workflows: "/api/workflows",
  prompts: "/api/prompts",
  file: fileOf,
  check: "/api/check",
  history: (kind: FileKind, project: string | null, name: string): string => historyOf(fileOf(kind, project, name)),
  version: (kind: FileKind, project: string | null, name: string, id: string): string =>
    versionOf(fileOf(kind, project, name), id),
  restore: (kind: FileKind, project: string | null, name: string, id: string): string =>
    `${versionOf(fileOf(kind, project, name), id)}/restore`,
  dashboard: "/api/dashboard",
} as const

/** Every query key; `path` is the API route the query reads (a file's or a change's). */
export const queryKeys = {
  projects: () => ["projects"] as const,
  changes: (key: string) => ["changes", key] as const,
  change: (path: string) => ["change", path] as const,
  workflows: () => ["workflows"] as const,
  prompts: () => ["prompts"] as const,
  file: (path: string) => ["file", path] as const,
  history: (path: string) => ["history", path] as const,
  version: (path: string, id: string | null) => ["version", path, id] as const,
  settings: () => ["dashboard-settings"] as const,
}

/** The settings while none are known: nothing pinned, grouped, opened or dismissed. */
export const NO_SETTINGS: DashboardSettings = { pinned: [], groups: [], recent: [], dismissed: [] }

/** `GET /api/projects`. */
export function useProjects() {
  return useQuery({ queryKey: queryKeys.projects(), queryFn: () => getJson(apiPath.projects, ProjectListSchema) })
}

/** Each project's change list (`GET /api/projects/:key/changes` of each of `keys`) and how their loads went. */
export type ChangeLists = {
  /** The loaded lists, in `keys` order. */
  lists: Map<string, ChangeList>
  /** A list is loading. */
  pending: boolean
  /** The keys whose list failed. */
  failed: string[]
  /** Every list has loaded. */
  complete: boolean
}

/** The change lists of `keys`; see `ChangeLists`. */
export function useChangeLists(keys: readonly string[]): ChangeLists {
  const results = useQueries({
    queries: keys.map((key) => ({
      queryKey: queryKeys.changes(key),
      queryFn: () => getJson(apiPath.changes(key), ChangeListSchema),
    })),
  })
  const lists = new Map<string, ChangeList>()
  const failed: string[] = []
  results.forEach((r, i) => {
    const key = keys[i] as string
    if (r.data !== undefined) lists.set(key, r.data)
    else if (r.isError) failed.push(key)
  })
  return {
    lists,
    pending: results.some((r) => r.isPending),
    failed,
    complete: results.every((r) => r.data !== undefined),
  }
}

/** An active change (`{ id }`) or an archived one (`{ dir }`): `GET /api/projects/:key/changes/…`. */
export function useChange(key: string, ref: { id: string } | { dir: string }) {
  const path = "dir" in ref ? apiPath.archived(key, ref.dir) : apiPath.change(key, ref.id)
  return useQuery({ queryKey: queryKeys.change(path), queryFn: () => getJson(path, ChangeDetailSchema) })
}

/** `GET /api/workflows`. */
export function useWorkflows() {
  return useQuery({ queryKey: queryKeys.workflows(), queryFn: () => getJson(apiPath.workflows, WorkflowListSchema) })
}

/** `GET /api/prompts`. */
export function usePrompts() {
  return useQuery({ queryKey: queryKeys.prompts(), queryFn: () => getJson(apiPath.prompts, PromptListSchema) })
}

/** A file's route: `GET /api/<kind>/global/<name>` or `…/projects/<key>/<name>`. */
export function useFile(kind: FileKind, project: string | null, name: string) {
  const path = apiPath.file(kind, project, name)
  return useQuery({ queryKey: queryKeys.file(path), queryFn: () => getJson(path, FileBodySchema) })
}

/** The versions of the file at the API route `path`, read while `active`. */
export function useHistory(path: string, active: boolean) {
  return useQuery({
    queryKey: queryKeys.history(path),
    queryFn: () => getJson(historyOf(path), VersionListSchema),
    enabled: active,
  })
}

/** The text of the version `id` of the file at the API route `path`, read while `active` and a version is chosen. */
export function useVersion(path: string, id: string | null, active: boolean) {
  return useQuery({
    queryKey: queryKeys.version(path, id),
    queryFn: () => getJson(versionOf(path, id ?? ""), VersionTextSchema),
    enabled: active && id !== null,
    staleTime: Infinity,
  })
}

/** The query of `GET /api/dashboard`. */
export function useSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: () => getJson(apiPath.dashboard, DashboardSettingsSchema),
  })
}

/** `GET /api/dashboard`: the sidebar's pins, groups, recents and dismissed suggestions, kept in the theway home. */
export function useSettings(): DashboardSettings {
  return useSettingsQuery().data ?? NO_SETTINGS
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

/** A write succeeded: a 200 whose body its schema accepts. */
const succeeded = (res: Sent<unknown>): boolean => res.status === 200 && res.body !== null

/**
 * The writes, each answering its `Sent`. A write that succeeds refreshes the queries it changes; any other answer
 * refreshes nothing.
 */
export function writes(client: QueryClient) {
  /** Invalidates `keys` when `res` succeeded, and gives `res` back. */
  const refresh = <T>(res: Sent<T>, keys: readonly QueryKey[]): Sent<T> => {
    if (succeeded(res)) for (const queryKey of keys) void client.invalidateQueries({ queryKey })
    return res
  }
  /** What a write of a workflow or prompt file changes: both lists, and the file's versions and text. */
  const fileKeys = (path: string): QueryKey[] => [
    queryKeys.workflows(),
    queryKeys.prompts(),
    queryKeys.history(path),
    queryKeys.file(path),
  ]

  return {
    /** `POST /api/check`: the lines of `text` as the file `name`. */
    checkFile: (kind: FileKind, project: string | null, name: string, text: string) =>
      sendJson("POST", apiPath.check, { kind, project, name, text }, CheckBodySchema),

    /** `PUT` of a workflow or prompt file against its version `base`. */
    saveFile: async (kind: FileKind, project: string | null, name: string, text: string, base: string) => {
      const path = apiPath.file(kind, project, name)
      return refresh(await sendJson("PUT", path, { text, base }, SavedSchema), fileKeys(path))
    },

    /** `PUT` of a new workflow or prompt file. */
    createFile: async (kind: FileKind, project: string | null, name: string, text: string) =>
      refresh(await sendJson("PUT", apiPath.file(kind, project, name), { text, base: null }, SavedSchema), [
        queryKeys.workflows(),
        queryKeys.prompts(),
      ]),

    /** Writes the version `id` as the file, against its version `base`. */
    restoreFile: async (kind: FileKind, project: string | null, name: string, id: string, base: string) =>
      refresh(
        await sendJson("POST", apiPath.restore(kind, project, name, id), { base }, SavedSchema),
        fileKeys(apiPath.file(kind, project, name)),
      ),

    /** `PUT` of one file of an active change against its version `base`. */
    saveChangeFile: async (key: string, id: string, name: string, text: string, base: string) =>
      refresh(await sendJson("PUT", apiPath.changeFile(key, id, name), { text, base }, SavedSchema), [
        queryKeys.changes(key),
        queryKeys.projects(),
      ]),

    /**
     * Writes the settings `edit` makes of the current ones (`PUT /api/dashboard`), shown at once and kept when the
     * write succeeds; a failed write reloads the file's settings and throws its error.
     */
    editSettings: async (edit: (now: DashboardSettings) => DashboardSettings): Promise<void> => {
      const next = edit(client.getQueryData<DashboardSettings>(queryKeys.settings()) ?? NO_SETTINGS)
      client.setQueryData(queryKeys.settings(), next)
      const res = await sendJson("PUT", apiPath.dashboard, next, DashboardSettingsSchema)
      if (res.status !== 200 || res.body === null) {
        void client.invalidateQueries({ queryKey: queryKeys.settings() })
        throw new Error(failureOf(res))
      }
      client.setQueryData(queryKeys.settings(), res.body)
    },
  }
}

export type Writes = ReturnType<typeof writes>

/** The writes on this app's query client. */
export function useWrites(): Writes {
  const client = useQueryClient()
  return useMemo(() => writes(client), [client])
}
