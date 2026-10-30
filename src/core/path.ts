import { join, resolve } from "node:path";
import { pointerPath, readPointer, resolveHome } from "./io";

/** Why `name` is not a single path segment, `""` when it is one. */
export function segmentReason(name: string): string {
  if (name === "") return "must not be empty";
  if (name.includes("/")) return "must not contain /";
  if (name === "." || name === "..") return `must not be ${name}`;
  return "";
}

/** `theway path [<project> [<change-id>]] [--verbose]`: the data home, a project folder or a change folder. */
export function cmdPath(project: string | undefined, changeId: string | undefined, verbose: boolean): number {
  const segments: [string, string | undefined][] = [
    ["project", project],
    ["change id", changeId],
  ];
  for (const [label, value] of segments) {
    if (value === undefined) continue;
    const reason = segmentReason(value);
    if (reason !== "") {
      const shown = value.replaceAll("\n", "\\n").replaceAll("\r", "\\r");
      process.stderr.write(`theway: invalid ${label} '${shown}': ${reason}\n`);
      return 1;
    }
  }

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
