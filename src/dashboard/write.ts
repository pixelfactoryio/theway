/**
 * The dashboard's writes: a file saved or created under `<home>/workflows`, `<home>/prompts` or the same two folders of
 * a project, the text it replaces kept as a version under `<home>/history/`, and those versions listed, read and
 * restored; a file of an active change saved in place; and the sidebar's settings, `<home>/dashboard.json`, read and
 * written. Every path is built from a listed project key, a listed change, a listed file name, a name matching `NAME`
 * and a version id matching its pattern, never taken from the request.
 */
import { mkdirSync, readdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { diffLines } from "diff"
import { isFile, readBytes, writeAtomic } from "../core/io"
import { warning } from "../core/output"
import type { Kind } from "../core/step-files"
import type { ChangeStore } from "../core/store"
import { sha256 } from "../core/store/files"
import { escaped } from "../core/text"
import type { DashboardGroup, DashboardSettings, Version, VersionList, VersionText } from "./contract"
import { absPath, refused } from "./files"

/** How many versions a file keeps: the newest. */
const KEPT = 20

/** A version's file name: `YYYYMMDDTHHMMSSmmmZ-<first 12 hex characters of the text's SHA-256>`. */
const VERSION_ID = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-[0-9a-f]{12}$/

/** What a write route answers. */
export type Answer = { status: number; body: unknown }

/** The folder of a file's versions: `<home>/history/global/<kind>/<name>` or `<home>/history/projects/<key>/<kind>/<name>`. */
const historyDir = (home: string, kind: Kind, project: string | null, name: string): string =>
  project === null
    ? join(home, "history", "global", kind, name)
    : join(home, "history", "projects", project, kind, name)

/** The version ids of a folder, newest first: its files whose name matches the pattern. */
function versionIds(dir: string): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((n) => VERSION_ID.test(n) && isFile(join(dir, n)))
    .sort()
    .reverse()
}

/** A version id's time stamp: `YYYYMMDDTHHMMSSmmmZ` of a date. */
const stampOf = (date: Date): string => date.toISOString().replace(/[-:.]/g, "")

/** The date a version id names. */
function dateOf(id: string): Date {
  const m = VERSION_ID.exec(id) as RegExpExecArray
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`)
}

/**
 * Keeps `text` as the newest version of the file and returns its path. The time is now, or 1ms after the newest version
 * when that is not earlier, so the names keep the order of the saves.
 */
function keepVersion(dir: string, text: Buffer): string {
  mkdirSync(dir, { recursive: true })
  const newest = versionIds(dir)[0]
  let at = new Date()
  if (newest !== undefined && dateOf(newest).getTime() >= at.getTime()) at = new Date(dateOf(newest).getTime() + 1)
  const path = join(dir, `${stampOf(at)}-${sha256(text).slice(0, 12)}`)
  writeAtomic(path, text)
  return path
}

/** Drops all but the `KEPT` newest versions of a history folder. */
function pruneVersions(dir: string): void {
  for (const old of versionIds(dir).slice(KEPT)) rmSync(join(dir, old), { force: true })
}

/**
 * Writes `text` to the file `name` of `kind` in the global folder (`project` `null`) or the project's own, when its
 * current version is `base` (`null`: the file is absent). The `base` check comes first; the same text writes nothing
 * and keeps no version; otherwise the replaced text is kept as a version and the file written atomically, its folder
 * created when missing. Old versions are pruned only after the write lands; a failed write removes the version it kept
 * and answers 500.
 */
export function writeFile(
  home: string,
  kind: Kind,
  project: string | null,
  name: string,
  text: string,
  base: string | null,
): Answer {
  const refusal = refused(home, project, name)
  if (refusal !== null) return refusal
  const path = absPath(home, kind, project, name)
  const exists = isFile(path)
  const current = exists ? readBytes(path) : null
  if (exists && current === null) return { status: 500, body: { error: "cannot be read" } }
  const version = current === null ? null : sha256(current)
  if (base === null && version !== null) return { status: 409, body: { error: "file exists", version } }
  if (version !== base) return { status: 409, body: { error: "changed on disk", version } }
  const bytes = Buffer.from(text, "utf-8")
  if (current !== null && current.equals(bytes)) return { status: 200, body: { version } }
  const dir = historyDir(home, kind, project, name)
  let kept: string | null = null
  try {
    if (current !== null) kept = keepVersion(dir, current)
    mkdirSync(dirname(path), { recursive: true })
    writeAtomic(path, bytes)
  } catch (e) {
    if (kept !== null) rmSync(kept, { force: true })
    return { status: 500, body: { error: `cannot write: ${e instanceof Error ? e.message : String(e)}` } }
  }
  if (kept !== null) pruneVersions(dir)
  return { status: 200, body: { version: sha256(bytes) } }
}

/** `GET /api/<kind>/<file>/history`: the versions, newest first, each with its line counts against the one before it. */
export function listVersions(home: string, kind: Kind, project: string | null, name: string): Answer {
  const refusal = refused(home, project, name)
  if (refusal !== null) return refusal
  const dir = historyDir(home, kind, project, name)
  const ids = versionIds(dir)
  const texts = ids.map((id) => readBytes(join(dir, id))?.toString("utf-8") ?? "")
  const versions: Version[] = ids.map((id, i) => {
    let added = 0
    let removed = 0
    for (const part of diffLines(texts[i + 1] ?? "", texts[i] as string)) {
      if (part.added) added += part.count
      else if (part.removed) removed += part.count
    }
    return { id, at: dateOf(id).toISOString(), added, removed }
  })
  const body: VersionList = { versions }
  return { status: 200, body }
}

/** The text of the version `id`, or the answer refusing it. */
function versionText(home: string, kind: Kind, project: string | null, name: string, id: string): VersionText | Answer {
  const refusal = refused(home, project, name)
  if (refusal !== null) return refusal
  const dir = historyDir(home, kind, project, name)
  if (!VERSION_ID.test(id) || !versionIds(dir).includes(id)) return { status: 404, body: { error: "unknown version" } }
  const bytes = readBytes(join(dir, id))
  if (bytes === null) return { status: 500, body: { error: "cannot be read" } }
  return { text: bytes.toString("utf-8") }
}

/** `GET /api/<kind>/<file>/history/:id`. */
export function readVersion(home: string, kind: Kind, project: string | null, name: string, id: string): Answer {
  const read = versionText(home, kind, project, name, id)
  return "text" in read ? { status: 200, body: { text: read.text } } : read
}

/** `POST /api/<kind>/<file>/history/:id/restore`: the version's text written as `PUT` writes it. */
export function restoreVersion(
  home: string,
  kind: Kind,
  project: string | null,
  name: string,
  id: string,
  base: string | null,
): Answer {
  const read = versionText(home, kind, project, name, id)
  return "text" in read ? writeFile(home, kind, project, name, read.text, base) : read
}

/**
 * `PUT /api/projects/:key/changes/:id/files/:name`: writes `text` to the file `name` of the active change `id` when its
 * current version is `base`. `name` is `change.yaml` or one of the change's listed Markdown files, and must exist. The
 * `base` check comes first; the same text writes nothing; otherwise the store writes the file in place, keeping its mode.
 */
export function writeChangeFile(
  store: ChangeStore,
  key: string,
  id: string,
  name: string,
  text: string,
  base: string,
): Answer {
  if (!store.projectKeys().includes(key)) return { status: 404, body: { error: "unknown project" } }
  if (!store.activeIds(key).includes(id)) return { status: 404, body: { error: "unknown change" } }
  const change = { kind: "active", id } as const
  if (!store.fileNames(key, change).includes(name)) return { status: 404, body: { error: "unknown file" } }
  try {
    const written = store.writeFile(key, id, name, Buffer.from(text, "utf-8"), base)
    if (written.status === "conflict") {
      if (written.version === null) return { status: 500, body: { error: "cannot be read" } }
      return { status: 409, body: { error: "changed on disk", version: written.version } }
    }
    return { status: 200, body: { version: written.version } }
  } catch (e) {
    return { status: 500, body: { error: `cannot write: ${e instanceof Error ? e.message : String(e)}` } }
  }
}

/** The settings of a home with no `dashboard.json`. */
const emptySettings = (): DashboardSettings => ({ pinned: [], groups: [], recent: [], dismissed: [] })

/** An entry of `pinned` and `recent`: `project:<key>` or `group:<id>`, as `DashboardSettingsSchema` has it. */
const SIDEBAR_ID = /^(?:project:.+|group:.{1,80})$/

/** Whether `v` is an object with exactly the keys `keys`. */
const exactly = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k))

/** `v` when it is an array of at most `max` strings, each passing `ok`, none twice when `distinct`; else `null`. */
function strings(v: unknown, max: number, ok: (s: string) => boolean, distinct: boolean): string[] | null {
  if (!Array.isArray(v) || v.length > max) return null
  if (!v.every((s) => typeof s === "string" && ok(s))) return null
  return distinct && new Set(v).size !== v.length ? null : (v as string[])
}

/**
 * The settings `body` holds, its group names trimmed, or `null` when it breaks a rule of `DashboardSettingsSchema`,
 * which the server does not import so zod stays out of the CLI: no other field; `recent` 10 entries at most, `pinned`
 * 50, `groups` 50, `dismissed` 200; ids of 1 to 80 characters, names of 1 to 80 once trimmed; no id twice; a project
 * key in one group at most.
 */
export function settingsOf(body: unknown): DashboardSettings | null {
  if (!exactly(body, ["pinned", "groups", "recent", "dismissed"])) return null
  const entry = (s: string) => SIDEBAR_ID.test(s)
  const pinned = strings(body.pinned, 50, entry, true)
  const recent = strings(body.recent, 10, entry, true)
  const dismissed = strings(body.dismissed, 200, () => true, false)
  if (pinned === null || recent === null || dismissed === null) return null
  if (!Array.isArray(body.groups) || body.groups.length > 50) return null
  const groups: DashboardGroup[] = []
  for (const g of body.groups as unknown[]) {
    if (!exactly(g, ["id", "name", "projects"])) return null
    const { id, name } = g
    const projects = strings(g.projects, Infinity, (s) => s.length > 0, false)
    if (typeof id !== "string" || id.length < 1 || id.length > 80 || typeof name !== "string" || projects === null)
      return null
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > 80) return null
    groups.push({ id, name: trimmed, projects })
  }
  if (new Set(groups.map((g) => g.id)).size !== groups.length) return null
  const keys = groups.flatMap((g) => g.projects)
  if (new Set(keys).size !== keys.length) return null
  return { pinned, groups, recent, dismissed }
}

/** `<home>/dashboard.json`, the sidebar's settings. */
const settingsPath = (home: string): string => join(home, "dashboard.json")

/**
 * `GET /api/dashboard`: the settings of `<home>/dashboard.json`; the empty settings when it is missing, and with a
 * `theway: warning:` line on stderr when it cannot be read, is not JSON or breaks a rule.
 */
export function readSettings(home: string): DashboardSettings {
  const path = settingsPath(home)
  if (!isFile(path)) return emptySettings()
  const bytes = readBytes(path)
  let settings: DashboardSettings | null = null
  if (bytes !== null) {
    try {
      settings = settingsOf(JSON.parse(bytes.toString("utf-8")))
    } catch {
      settings = null
    }
  }
  if (settings !== null) return settings
  warning(`${escaped(path)} is not valid dashboard settings; the sidebar starts empty`)
  return emptySettings()
}

/** `PUT /api/dashboard`: writes `settings` whole to `<home>/dashboard.json` and answers them; no version is kept. */
export function writeSettings(home: string, settings: DashboardSettings): Answer {
  try {
    mkdirSync(home, { recursive: true })
    writeAtomic(settingsPath(home), `${JSON.stringify(settings, null, 2)}\n`)
  } catch (e) {
    return { status: 500, body: { error: `cannot write: ${e instanceof Error ? e.message : String(e)}` } }
  }
  return { status: 200, body: settings }
}
