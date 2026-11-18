import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect } from "react"

import { type DashboardSettings, DashboardSettingsSchema } from "../../contract"
import { failureOf, sendJson } from "@/shell/api"
import { getJson } from "@/shell/projects"

export type { DashboardSettings } from "../../contract"

/** The settings while none are known: nothing pinned, grouped, opened or dismissed. */
export const NO_SETTINGS: DashboardSettings = { pinned: [], groups: [], recent: [], dismissed: [] }

/** How many recently opened entries the file keeps. */
const RECENT_KEPT = 10

const KEY = ["dashboard-settings"]

/** The query of `GET /api/dashboard`. */
const useSettingsQuery = () =>
  useQuery({ queryKey: KEY, queryFn: () => getJson("/api/dashboard", DashboardSettingsSchema) })

/** `GET /api/dashboard`: the sidebar's pins, groups, recents and dismissed suggestions, kept in the theway home. */
export function useSettings(): DashboardSettings {
  return useSettingsQuery().data ?? NO_SETTINGS
}

/**
 * Writes the settings `edit` makes of the current ones (`PUT /api/dashboard`), shown at once and kept when the write
 * succeeds; a failed write reloads the file's settings and throws its error.
 */
export function useEditSettings(): (edit: (now: DashboardSettings) => DashboardSettings) => Promise<void> {
  const client = useQueryClient()
  return useCallback(
    async (edit) => {
      const now = client.getQueryData<DashboardSettings>(KEY) ?? NO_SETTINGS
      const next = edit(now)
      client.setQueryData(KEY, next)
      const res = await sendJson("PUT", "/api/dashboard", next, DashboardSettingsSchema)
      if (res.body === null) {
        void client.invalidateQueries({ queryKey: KEY })
        throw new Error(failureOf(res))
      }
      client.setQueryData(KEY, res.body)
    },
    [client],
  )
}

/** The settings with `id` (`project:<key>` or `group:<id>`) first among the recently opened. */
export const visited = (now: DashboardSettings, id: string): DashboardSettings =>
  now.recent[0] === id ? now : { ...now, recent: [id, ...now.recent.filter((r) => r !== id)].slice(0, RECENT_KEPT) }

/** The id a project is recorded under: its group's when it is in one, else its own. */
export const recordedId = (settings: DashboardSettings, key: string): string => {
  const group = settings.groups.find((g) => g.projects.includes(key))
  return group !== undefined ? `group:${group.id}` : `project:${key}`
}

/** Records `id` as opened once the settings have loaded; a failed write is left for the next visit. */
export function useRecordVisit(id: string | null): void {
  const query = useSettingsQuery()
  const first = query.data?.recent[0]
  const edit = useEditSettings()
  useEffect(() => {
    if (id === null || !query.isSuccess || first === id) return
    edit((now) => visited(now, id)).catch(() => undefined)
  }, [id, query.isSuccess, first, edit])
}

/** The `sessionStorage` key marking the start project as recorded in this browser tab. */
const START_KEY = "theway-start-recorded"

/**
 * Records the project the command started in (its group when it is in one) as opened, once per browser tab, so it
 * shows under Recent.
 */
export function useRecordStart(start: string | null): void {
  const query = useSettingsQuery()
  const edit = useEditSettings()
  const settings = query.data
  useEffect(() => {
    if (start === null || settings === undefined) return
    try {
      if (sessionStorage.getItem(START_KEY) !== null) return
      sessionStorage.setItem(START_KEY, "1")
    } catch {
      return
    }
    const id = recordedId(settings, start)
    if (settings.recent[0] !== id) edit((now) => visited(now, id)).catch(() => undefined)
  }, [start, settings, edit])
}
