import { join, resolve } from "node:path"
import { pointerPath, readPointer, resolveHome } from "./io"
import { error, info, print, warning } from "./output"
import { projectDir, projectKeyOrExit } from "./project"
import { escaped } from "./text"

const CHANGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Why `v` is not a valid change id, `""` when it is one. */
export function changeIdReason(v: string): string {
  if (v === "") return "must not be empty"
  if (v.length > 200) return "must be at most 200 characters"
  if (!CHANGE_ID.test(v)) return "must be lowercase letters and digits in words separated by single hyphens"
  return ""
}

/** The message `invalid change id '<id>': <reason>` when `id` is not a valid change id; `null` otherwise. */
export function invalidChangeId(id: string): string | null {
  const reason = changeIdReason(id)
  return reason === "" ? null : `invalid change id '${escaped(id)}': ${reason}`
}

/** `theway path [<change-id>] [--project <key>] [--verbose]`: the data home, or a change folder of the project. */
export function cmdPath(changeId: string | undefined, override: string | undefined, verbose: boolean): number {
  // Without a change id only the home is printed: a given --project is validated, no key is derived.
  let key: string | null = null
  if (changeId !== undefined || override !== undefined) {
    const resolved = projectKeyOrExit(override)
    if (typeof resolved === "number") return resolved
    if (changeId !== undefined) key = resolved.key
  }
  if (changeId !== undefined) {
    const invalid = invalidChangeId(changeId)
    if (invalid !== null) return error(invalid)
  }

  const { home, source } = resolveHome()
  if (verbose) info(`home ${home} (from ${source})`)
  if (source === "env") {
    const pointer = readPointer()
    if (pointer !== "" && resolve(pointer) !== home) {
      warning(
        `THEWAY_HOME is ${home} (from env) but ${pointerPath()} holds ${resolve(pointer)} (from pointer); using ${home}`,
      )
    }
  }

  const out = changeId !== undefined && key !== null ? join(projectDir(home, key), "changes", changeId) : home
  print(`${out}\n`)
  return 0
}
