/** Helpers shared by the test files. */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

/** Writes `text` to `path`, creating its folders. */
export function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

/** A string escaped for use inside a regular expression. */
export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
