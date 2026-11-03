import { join } from "node:path";
import { stringify } from "yaml";
import { loadConfig } from "./config";
import { thewayHome } from "./io";
import { invalidChangeId } from "./path";
import { projectDir, resolveKey } from "./project";
import { checkPhase, selectStandards } from "./standards";

/**
 * `theway context <engineering|develop|document> [<change-id>] [--project <key>]`: what a command loads in its first
 * step, as one YAML document: `home`, `project` (the key), `project_dir`, `change_dir` (only with a change id), `standards` (as `theway standards` selects them) and
 * `config` (as `theway config` prints it).
 */
export function cmdContext(phase: string, changeId: string | undefined, override: string | undefined): number {
  const key = resolveKey(override);
  if (key === null) return 1;
  if (!checkPhase(phase)) return 1;
  if (invalidChangeId(changeId)) return 1;

  const home = thewayHome();
  const loaded = loadConfig(home, key);
  if (loaded === null) return 1;
  const dir = projectDir(home, key);
  const doc: Record<string, unknown> = { home, project: key, project_dir: dir };
  if (changeId !== undefined) doc.change_dir = join(dir, "changes", changeId);
  doc.standards = selectStandards(loaded, phase);
  doc.config = loaded.config;
  process.stdout.write(stringify(doc));
  return 0;
}
