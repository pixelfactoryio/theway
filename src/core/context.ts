import { join } from "node:path";
import { stringify } from "yaml";
import { loadConfig } from "./config";
import { thewayHome } from "./io";
import { invalidSegments } from "./path";
import { checkPhase, selectStandards } from "./standards";

/**
 * `theway context <project> <engineering|develop|document> [<change-id>]`: what a command loads in its first step, as one
 * YAML document: `home`, `change_dir` (only with a change id), `standards` (as `theway standards` selects them) and
 * `config` (as `theway config` prints it).
 */
export function cmdContext(project: string, phase: string, changeId: string | undefined): number {
  if (invalidSegments([["project", project]])) return 1;
  if (!checkPhase(phase)) return 1;
  if (invalidSegments([["change id", changeId]])) return 1;

  const home = thewayHome();
  const loaded = loadConfig(home, project);
  if (loaded === null) return 1;
  const doc: Record<string, unknown> = { home };
  if (changeId !== undefined) doc.change_dir = join(home, project, "changes", changeId);
  doc.standards = selectStandards(loaded, phase);
  doc.config = loaded.config;
  process.stdout.write(stringify(doc));
  return 0;
}
