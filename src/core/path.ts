import { join, resolve } from "node:path";
import { escaped, pointerPath, readPointer, resolveHome } from "./io";
import { error, print, warning } from "./output";
import { projectDir, resolveKey } from "./project";

const CHANGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Why `v` is not a valid change id, `""` when it is one. */
export function changeIdReason(v: string): string {
  if (v === "") return "must not be empty";
  if (v.length > 200) return "must be at most 200 characters";
  if (!CHANGE_ID.test(v)) return "must be lowercase letters and digits in words separated by single hyphens";
  return "";
}

/** `theway path [<change-id>] [--project <key>] [--verbose]`: the data home, or a change folder of the project. */
export function cmdPath(changeId: string | undefined, override: string | undefined, verbose: boolean): number {
  // Without a change id only the home is printed: a given --project is validated, no key is derived.
  let key: string | null = null;
  if (changeId !== undefined || override !== undefined) {
    const resolved = resolveKey(override);
    if ("error" in resolved) return error(resolved.error);
    if (resolved.warning !== null) warning(resolved.warning);
    if (changeId !== undefined) key = resolved.key;
  }
  if (changeId !== undefined) {
    const reason = changeIdReason(changeId);
    if (reason !== "") return error(`invalid change id '${escaped(changeId)}': ${reason}`);
  }

  const { home, source } = resolveHome();
  // An informational line with the theway: prefix, written through error() and its exit code ignored.
  if (verbose) error(`home ${home} (from ${source})`);
  if (source === "env") {
    const pointer = readPointer();
    if (pointer !== "" && resolve(pointer) !== home) {
      warning(`THEWAY_HOME is ${home} (from env) but ${pointerPath()} holds ${resolve(pointer)} (from pointer); using ${home}`);
    }
  }

  const out = changeId !== undefined && key !== null ? join(projectDir(home, key), "changes", changeId) : home;
  print(`${out}\n`);
  return 0;
}
