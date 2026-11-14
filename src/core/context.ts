import { join } from "node:path";
import { stringify } from "yaml";
import { loadConfigResult } from "./config";
import { escaped, thewayHome } from "./io";
import { error, print, warning, warnLoud } from "./output";
import { changeIdReason } from "./path";
import { projectDir, resolveKey } from "./project";
import { checkPhase, type Phase, selectStandards } from "./standards";

/**
 * `theway context <engineering|develop|document> [<change-id>] [--project <key>]`: what a command loads in its first
 * step, as one YAML document: `home`, `project` (the key), `project_dir`, `change_dir` (only with a change id), `standards` (as `theway standards` selects them) and
 * `config` (as `theway config` prints it).
 */
export function cmdContext(phase: string, changeId: string | undefined, override: string | undefined): number {
  const resolved = resolveKey(override);
  if ("error" in resolved) return error(resolved.error);
  if (resolved.warning !== null) warning(resolved.warning);
  const key = resolved.key;
  const invalid = checkPhase(phase);
  if (invalid !== null) return error(invalid);
  if (changeId !== undefined) {
    const reason = changeIdReason(changeId);
    if (reason !== "") return error(`invalid change id '${escaped(changeId)}': ${reason}`);
  }

  const home = thewayHome();
  const loaded = loadConfigResult(home, key, warnLoud);
  if ("error" in loaded) return error(loaded.error);
  const dir = projectDir(home, key);
  const doc: Record<string, unknown> = { home, project: key, project_dir: dir };
  if (changeId !== undefined) doc.change_dir = join(dir, "changes", changeId);
  const selected = selectStandards(loaded, phase as Phase);
  for (const w of selected.warnings) warning(w);
  doc.standards = selected.paths;
  doc.config = loaded.config;
  print(stringify(doc));
  return 0;
}
