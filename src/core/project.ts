import { spawnSync } from "node:child_process"
import { readFileSync, realpathSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { isDir, thewayHome, writeAtomic } from "./io"
import { error, print, warning } from "./output"
import { escaped } from "./text"

const KEY = /^[A-Za-z0-9-]{1,200}$/

/** Why `v` is not a valid project key, `""` when it is one. */
export function projectReason(v: string): string {
  return KEY.test(v) ? "" : 'must be letters, digits and "-", at most 200 characters'
}

/** The trimmed stdout of `git rev-parse <flags>` in the current directory, `null` when git fails or is missing. */
function revParse(...flags: string[]): string | null {
  const res = spawnSync("git", ["rev-parse", ...flags], {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (res.error !== undefined || res.status !== 0) return null
  return res.stdout.trim()
}

/**
 * The project root: the main repository's root from a repository, any of its subfolders or a linked worktree; the
 * worktree root of a bare repository or a separate git dir; the current directory outside git. Physical path.
 */
export function projectRoot(): string {
  if (process.platform === "win32") return windowsRoot()
  const cwd = process.cwd()
  let root = cwd
  const common = revParse("--git-common-dir")
  if (common !== null) {
    const dir = resolve(cwd, common)
    if (basename(dir) === ".git") root = dirname(dir)
    else {
      const top = revParse("--show-toplevel")
      root = top !== null && top !== "" ? resolve(cwd, top) : cwd
    }
  }
  try {
    return realpathSync(root)
  } catch {
    return root
  }
}

/**
 * `projectRoot` on Windows: git's absolute paths, then the long-name form (`C:\Users\runneradmin`, never the 8.3
 * `C:\Users\RUNNER~1`), so one repository has one key whatever form the current directory takes.
 */
function windowsRoot(): string {
  const cwd = process.cwd()
  let root = cwd
  const common = revParse("--path-format=absolute", "--git-common-dir")
  if (common !== null) {
    if (basename(common) === ".git") root = dirname(common)
    else {
      const top = revParse("--path-format=absolute", "--show-toplevel")
      root = top !== null && top !== "" ? top : cwd
    }
  }
  try {
    return realpathSync.native(root)
  } catch {
    // git prints C:/…: resolve gives the native separators.
    return resolve(root)
  }
}

/** The key of a project root: its absolute path with every character outside `[A-Za-z0-9]` replaced by `-`. */
export const keyOf = (root: string): string => root.replace(/[^A-Za-z0-9]/g, "-")

/** The folder of a project under the home. */
export const projectDir = (home: string, key: string): string => join(home, "projects", key)

/**
 * The root recorded in `<home>/projects/<key>/root`, without its one trailing newline. `null` when the file is absent,
 * cannot be read or is empty.
 */
export function recordedRoot(home: string, key: string): string | null {
  let text: string
  try {
    text = readFileSync(join(projectDir(home, key), "root"), "utf-8")
  } catch {
    return null
  }
  const root = text.endsWith("\n") ? text.slice(0, -1) : text
  return root === "" ? null : root
}

/** The outcome of claiming a project folder for a root; `warning` when the claim could not be recorded. */
type Claim = { ok: true } | { ok: true; warning: string } | { ok: false; recorded: string }

/**
 * Claims the folder of `key` for `root`: records `root` in its `root` file when the folder exists and has no record;
 * refuses when it records another root. Nothing is written when the folder does not exist. Writes nothing to stderr.
 */
export function claimKey(home: string, key: string, root: string): Claim {
  const dir = projectDir(home, key)
  if (!isDir(dir)) return { ok: true }
  const recorded = recordedRoot(home, key)
  if (recorded === null) {
    const file = join(dir, "root")
    try {
      writeAtomic(file, `${root}\n`)
    } catch (e) {
      return { ok: true, warning: `cannot record ${file}: ${(e as Error).message}` }
    }
    return { ok: true }
  }
  return recorded === root ? { ok: true } : { ok: false, recorded }
}

/**
 * The project key: `override` once validated, else the key derived from the current directory, with the warning of a
 * claim that could not be recorded. The error message when the override is invalid, the derived key is longer than 200
 * characters or its folder is claimed by another root. A derived key claims its folder (`claimKey`).
 */
export function resolveKey(override: string | undefined): { key: string; warning: string | null } | { error: string } {
  if (override !== undefined) {
    const reason = projectReason(override)
    if (reason === "") return { key: override, warning: null }
    const shown = escaped(override)
    return { error: `invalid project '${shown}': ${reason}` }
  }
  const root = projectRoot()
  const key = keyOf(root)
  if (key.length > 200) {
    return { error: `project key for ${root} is longer than 200 characters; pass --project <key>` }
  }
  const claim = claimKey(thewayHome(), key, root)
  if (!claim.ok) {
    return {
      error: `project key ${key} is used by ${claim.recorded}; pass --project <key> to use another key for ${root}`,
    }
  }
  return { key, warning: "warning" in claim ? claim.warning : null }
}

/** The key of `resolveKey(override)`, its warning printed; on its error, the error printed and the exit code. */
export function projectKeyOrExit(override: string | undefined): { key: string } | number {
  const resolved = resolveKey(override)
  if ("error" in resolved) return error(resolved.error)
  if (resolved.warning !== null) warning(resolved.warning)
  return { key: resolved.key }
}

/** `theway project [--project <key>]`: the project key and folder. */
export function cmdProject(override: string | undefined): number {
  const resolved = projectKeyOrExit(override)
  if (typeof resolved === "number") return resolved
  const key = resolved.key
  print(`key: ${key}\ndir: ${projectDir(thewayHome(), key)}\n`)
  return 0
}
