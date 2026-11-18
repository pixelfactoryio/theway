/** What every dashboard server module takes: the home, and the one store `createApp` builds over it. */
import type { ChangeStore } from "../core/store"

/** The home of the dashboard and its store. */
export type DashboardContext = { home: string; store: ChangeStore }

/** Whether `key` is a project the store lists. Route parameters arrive decoded, so each is checked before use. */
export const knownProject = (ctx: DashboardContext, key: string): boolean => ctx.store.projectKeys().includes(key)

/** The answer to a route naming a project the store does not list. */
export const UNKNOWN_PROJECT = { status: 404, body: { error: "unknown project" } } as const
