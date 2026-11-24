/**
 * The dashboard's addresses: every route pattern once, in the router's order, a builder per route, the matching the
 * router does with `regexparam`'s `parse`, and the page an address is on. Pure: no React, no DOM.
 *
 * Each builder encodes its parameters with `encodeURIComponent`; the router decodes the path with `decodeURI`, and
 * `decoded` decodes each parameter. A parameter holding a literal `%` followed by two hex digits is therefore decoded
 * once more than it was encoded: no project key, change ID, file name or `groupId()` value can hold one.
 */
import { parse } from "regexparam"

/** The routes of the router's `Switch`, in its order; `fallback` (no pattern) matches any path. */
export const ROUTES = [
  { name: "now", pattern: "/" },
  { name: "projects", pattern: "/projects" },
  { name: "group", pattern: "/group/:id" },
  { name: "changes", pattern: "/:key/changes/*?" },
  { name: "workflows", pattern: "/workflows" },
  { name: "workflowGlobal", pattern: "/workflows/global/:name/:tab?" },
  { name: "workflowProject", pattern: "/workflows/projects/:key/:name/:tab?" },
  { name: "prompts", pattern: "/prompts" },
  { name: "promptGlobal", pattern: "/prompts/global/:name/:tab?" },
  { name: "promptProject", pattern: "/prompts/projects/:key/:name/:tab?" },
  { name: "project", pattern: "/:key" },
  { name: "fallback", pattern: null },
] as const satisfies readonly { name: string; pattern: string | null }[]

export type RouteName = (typeof ROUTES)[number]["name"]

/** The routes inside `changes`, in the order they are matched: an archived change, then an active one. */
export const CHANGE_ROUTES = {
  archived: "/:key/changes/archive/:dir/:tab?",
  change: "/:key/changes/:id/:tab?",
} as const

/** A route's parameters by name; an optional one that is absent is left out. */
export type Params = Readonly<Partial<Record<string, string>>>

export type FileKind = "workflows" | "prompts"

const enc = encodeURIComponent

/** `path`, then `/<tab>` when there is a tab. */
const withTab = (path: string, tab: string | undefined): string => (tab === undefined ? path : `${path}/${enc(tab)}`)

/** `?archive` for the whole archive, else `?`, which clears the search part. */
const search = (archive: boolean | undefined): string => (archive === true ? "?archive" : "?")

/** The address of each page. Every address ends in its search part: `?`, which clears it, or `?archive`. */
export const to = {
  now: (): string => "/?",
  projects: (): string => "/projects?",
  workflows: (): string => "/workflows?",
  prompts: (): string => "/prompts?",
  project: (key: string, opts: { archive?: boolean } = {}): string => `/${enc(key)}${search(opts.archive)}`,
  group: (id: string, opts: { archive?: boolean } = {}): string => `/group/${enc(id)}${search(opts.archive)}`,
  change: (key: string, id: string, tab?: string): string => `${withTab(`/${enc(key)}/changes/${enc(id)}`, tab)}?`,
  archived: (key: string, dir: string, tab?: string): string =>
    `${withTab(`/${enc(key)}/changes/archive/${enc(dir)}`, tab)}?`,
  file: (kind: FileKind, project: string | null, name: string, tab?: string): string =>
    `${withTab(project === null ? `/${kind}/global/${enc(name)}` : `/${kind}/projects/${enc(project)}/${enc(name)}`, tab)}?`,
}

/**
 * The `href` a link renders for the app address `address` on a page served at `pathname`: the address the in-app
 * navigation gives (wouter's hash `navigate`), its search part before the hash and none when it is empty, so a
 * Cmd-click, a middle-click or Copy link opens the same page: `/x?archive` is `<pathname>?archive#/x`, `/x?` is
 * `<pathname>#/x`.
 */
export function linkHref(address: string, pathname: string): string {
  const [path = "", search = ""] = address.replace(/^#?\/?/, "").split("?")
  return `${pathname}${search === "" ? "" : `?${search}`}#/${path}`
}

/** Each defined value of a router's parameters through `decodeURIComponent`; a value it cannot decode is kept. */
export function decoded(params: Readonly<Partial<Record<string, string>>>): Params {
  const out: Partial<Record<string, string>> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    try {
      out[k] = decodeURIComponent(v)
    } catch {
      out[k] = v
    }
  }
  return out
}

/** The location the router's `useLocation` gives for `address`: no search part, no leading `#`, through `decodeURI`. */
export function locationOf(address: string): string {
  const path = address.replace(/^#/, "").split("?")[0] as string
  try {
    return decodeURI(path)
  } catch {
    return path
  }
}

/** Whether `location` (a `useLocation` value) shows `href`, or one of its sub-views. */
export function isAt(location: string, href: string): boolean {
  const at = locationOf(href)
  return location === at || location.startsWith(`${at}/`)
}

/** The decoded named parameters of `path` (an address, or a location) on `pattern`; `null` when it does not match. */
export function matchPath(pattern: string, path: string): Params | null {
  const { keys, pattern: rx } = parse(pattern)
  const m = rx.exec(locationOf(path))
  if (m === null) return null
  const params: Partial<Record<string, string>> = {}
  keys.forEach((k, i) => {
    params[k] = m[i + 1]
  })
  return decoded(params)
}

/** The route the router renders for `path`: the first of `ROUTES` that matches, with its parameters. */
export function routeOf(path: string): { name: RouteName; params: Params } {
  for (const r of ROUTES) {
    if (r.pattern === null) continue
    const params = matchPath(r.pattern, path)
    if (params !== null) return { name: r.name, params }
  }
  return { name: "fallback", params: {} }
}

const patternOf = (name: RouteName): string => ROUTES.find((r) => r.name === name)?.pattern ?? ""

export type ChangePage = { kind: "change"; key: string; id: string }
export type ArchivedPage = { kind: "archived"; key: string; dir: string }
export type FilePage = { kind: "file"; fileKind: FileKind; project: string | null; name: string }
export type Page = ChangePage | ArchivedPage | FilePage

/** The file routes: each one's kind, and whether it is a project's. */
const FILE_ROUTES: Partial<Record<RouteName, { fileKind: FileKind; own: boolean }>> = {
  workflowGlobal: { fileKind: "workflows", own: false },
  workflowProject: { fileKind: "workflows", own: true },
  promptGlobal: { fileKind: "prompts", own: false },
  promptProject: { fileKind: "prompts", own: true },
}

/** The page `path` (an address, or a location) is on: a change, an archived change or a file; `null` for any other. */
export function pageOf(path: string): Page | null {
  const archived = matchPath(CHANGE_ROUTES.archived, path)
  if (archived !== null) return { kind: "archived", key: archived.key ?? "", dir: archived.dir ?? "" }
  const change = matchPath(CHANGE_ROUTES.change, path)
  if (change !== null) return { kind: "change", key: change.key ?? "", id: change.id ?? "" }
  const { name, params } = routeOf(path)
  const file = FILE_ROUTES[name]
  if (file === undefined) return null
  return {
    kind: "file",
    fileKind: file.fileKind,
    project: file.own ? (params.key ?? "") : null,
    name: params.name ?? "",
  }
}

/** The key of `/:key/changes/*?`, else of `/:key`; `null` for any other path. `/projects` gives `"projects"`. */
export function routeKeyOf(path: string): string | null {
  return matchPath(patternOf("changes"), path)?.key ?? matchPath(patternOf("project"), path)?.key ?? null
}

/** Whether going to `target` leaves the change `page`: another tab or another search part does not. */
export function leavesChange(page: { key: string; id: string }, target: string): boolean {
  const at = pageOf(target)
  return !(at?.kind === "change" && at.key === page.key && at.id === page.id)
}

/** Whether going to `target` leaves the file `page`: another tab or another search part does not. */
export function leavesFile(
  page: { fileKind: FileKind; project: string | null; name: string },
  target: string,
): boolean {
  const at = pageOf(target)
  return !(at?.kind === "file" && at.fileKind === page.fileKind && at.project === page.project && at.name === page.name)
}
