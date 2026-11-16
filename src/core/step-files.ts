import { readdirSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { isFileIn, type Overlay } from "./io"
import { NAME } from "./language-schema"
import { projectDir } from "./project"

/** The kinds of named files the resolver reads: workflows as `.yaml`, prompts as `.md`. */
export type Kind = "workflows" | "prompts"
export const EXT: Record<Kind, string> = { workflows: ".yaml", prompts: ".md" }

/** The project folder and the global folder of `kind`; the global folder alone for the `null` key (the global context). */
export const dirsOf = (home: string, key: string | null, kind: Kind): string[] =>
  key === null ? [join(home, kind)] : [join(projectDir(home, key), kind), join(home, kind)]

/** The folders searched for `kind`, for an error line: `<project dir> or <global dir>`, or `<global dir>` for `null`. */
export const searched = (home: string, key: string | null, kind: Kind): string => dirsOf(home, key, kind).join(" or ")

/**
 * The file of `name` of `kind`: the project one if it is a file, else the global one, else `null` (the global one only
 * for the `null` key); a path the overlay holds is a file when its value is a string.
 */
export function fileOf(home: string, key: string | null, kind: Kind, name: string, overlay?: Overlay): string | null {
  for (const dir of dirsOf(home, key, kind)) {
    const path = join(dir, `${name}${EXT[kind]}`)
    if (isFileIn(path, overlay)) return path
  }
  return null
}

/**
 * The valid names of the regular `kind` files directly in `dir`, `.default` copies left out, sorted; `rejected` is
 * called, in sorted order, with the path of each such file whose stem is not a valid name. The overlay adds the paths
 * in `dir` it holds with a string, and removes those it holds with `null`.
 */
export function namesIn(dir: string, kind: Kind, rejected?: (path: string) => void, overlay?: Overlay): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    entries = []
  }
  for (const path of overlay?.keys() ?? []) {
    if (dirname(path) === dir && !entries.includes(basename(path))) entries.push(basename(path))
  }
  const ext = EXT[kind]
  const out: string[] = []
  for (const n of entries.sort()) {
    if (!n.endsWith(ext) || n.endsWith(`.default${ext}`) || !isFileIn(join(dir, n), overlay)) continue
    const stem = n.slice(0, -ext.length)
    if (NAME.test(stem)) out.push(stem)
    else rejected?.(join(dir, n))
  }
  return out.sort()
}
