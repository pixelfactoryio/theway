import { join, resolve } from "node:path";
import { pointerPath, readPointer, resolveHome } from "./io";

const CHANGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

/** Why `v` is not a valid change id, `""` when it is one. */
export function changeIdReason(v: string): string {
  if (v === "") return "must not be empty";
  if (v.length > 200) return "must be at most 200 characters";
  if (!CHANGE_ID.test(v)) return "must be lowercase letters and digits in words separated by single hyphens";
  return "";
}

/** Why `v` is not a valid project name, `""` when it is one. */
export function projectReason(v: string): string {
  if (v === "") return "must not be empty";
  if (v.length > 200) return "must be at most 200 characters";
  if (!PROJECT.test(v)) return 'must be letters, digits, ".", "_" or "-", not starting with "." or "-"';
  return "";
}

/** Writes the reason line for the first invalid project or change id and returns true; false when all are valid. */
export function invalidSegments(segments: [string, string | undefined][]): boolean {
  for (const [label, value] of segments) {
    if (value === undefined) continue;
    const reason = label === "project" ? projectReason(value) : changeIdReason(value);
    if (reason !== "") {
      const shown = value.replaceAll("\n", "\\n").replaceAll("\r", "\\r");
      process.stderr.write(`theway: invalid ${label} '${shown}': ${reason}\n`);
      return true;
    }
  }
  return false;
}

/** `theway path [<project> [<change-id>]] [--verbose]`: the data home, a project folder or a change folder. */
export function cmdPath(project: string | undefined, changeId: string | undefined, verbose: boolean): number {
  if (
    invalidSegments([
      ["project", project],
      ["change id", changeId],
    ])
  )
    return 1;

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

  let out = home;
  if (project !== undefined) out = join(home, project);
  if (project !== undefined && changeId !== undefined) out = join(home, project, "changes", changeId);
  process.stdout.write(`${out}\n`);
  return 0;
}
