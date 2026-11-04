import { join, resolve } from "node:path";
import { escaped, pointerPath, readPointer, resolveHome } from "./io";
import { projectDir, resolveKey } from "./project";

const CHANGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Why `v` is not a valid change id, `""` when it is one. */
export function changeIdReason(v: string): string {
  if (v === "") return "must not be empty";
  if (v.length > 200) return "must be at most 200 characters";
  if (!CHANGE_ID.test(v)) return "must be lowercase letters and digits in words separated by single hyphens";
  return "";
}

/** Writes the reason line when `changeId` is given and invalid and returns true; false otherwise. */
export function invalidChangeId(changeId: string | undefined): boolean {
  if (changeId === undefined) return false;
  const reason = changeIdReason(changeId);
  if (reason === "") return false;
  const shown = escaped(changeId);
  process.stderr.write(`theway: invalid change id '${shown}': ${reason}\n`);
  return true;
}

/** `theway path [<change-id>] [--project <key>] [--verbose]`: the data home, or a change folder of the project. */
export function cmdPath(changeId: string | undefined, override: string | undefined, verbose: boolean): number {
  // Without a change id only the home is printed: a given --project is validated, no key is derived.
  if (changeId === undefined && override !== undefined && resolveKey(override) === null) return 1;
  const key = changeId === undefined ? null : resolveKey(override);
  if (changeId !== undefined && key === null) return 1;
  if (invalidChangeId(changeId)) return 1;

  const { home, source } = resolveHome();
  if (verbose) process.stderr.write(`theway: home ${home} (from ${source})\n`);
  if (source === "env") {
    const pointer = readPointer();
    if (pointer !== "" && resolve(pointer) !== home) {
      process.stderr.write(
        `theway: warning: THEWAY_HOME is ${home} (from env) but ${pointerPath()} holds ${resolve(pointer)} (from pointer); using ${home}\n`,
      );
    }
  }

  const out = changeId !== undefined && key !== null ? join(projectDir(home, key), "changes", changeId) : home;
  process.stdout.write(`${out}\n`);
  return 0;
}
