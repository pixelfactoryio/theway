import { join } from "node:path"
import { stringify } from "yaml"
import { loadConfigResult } from "./config"
import { thewayHome } from "./io"
import { error, print, warning, warnLoud } from "./output"
import { invalidChangeId } from "./path"
import { projectDir, projectKeyOrExit } from "./project"
import { checkPhase, type Phase, selectStandards } from "./standards"

/**
 * `theway context <engineering|develop|document> [<change-id>] [--project <key>]`: what a command loads in its first
 * step, as one YAML document: `home`, `project` (the key), `project_dir`, `change_dir` (only with a change id), `standards` (as `theway standards` selects them) and
 * `config` (as `theway config` prints it).
 */
export function cmdContext(phase: string, changeId: string | undefined, override: string | undefined): number {
  const resolved = projectKeyOrExit(override)
  if (typeof resolved === "number") return resolved
  const key = resolved.key
  const invalid = checkPhase(phase)
  if (invalid !== null) return error(invalid)
  if (changeId !== undefined) {
    const invalid = invalidChangeId(changeId)
    if (invalid !== null) return error(invalid)
  }

  const home = thewayHome()
  const loaded = loadConfigResult(home, key, warnLoud)
  if ("error" in loaded) return error(loaded.error)
  const dir = projectDir(home, key)
  const doc: Record<string, unknown> = { home, project: key, project_dir: dir }
  if (changeId !== undefined) doc.change_dir = join(dir, "changes", changeId)
  const selected = selectStandards(loaded, phase as Phase)
  for (const w of selected.warnings) warning(w)
  doc.standards = selected.paths
  doc.config = loaded.config
  print(stringify(doc))
  return 0
}
