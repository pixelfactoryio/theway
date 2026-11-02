import { readdirSync } from "node:fs";
import { join } from "node:path";
import { isDir, thewayHome } from "./io";
import { invalidSegments } from "./path";
import { standaloneReason } from "./validate-id";

/** The names of the directories directly in `dir`; none when it is missing. */
function dirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => isDir(join(dir, n)));
  } catch {
    return [];
  }
}

/**
 * `theway next-id <project> <series-id> [--count <n>]`: the next `count` free member ids of a series, one per line,
 * after the highest ordinal among the active (`changes/<series-id>-NN`) and archived (`changes/archive/YYYY-MM-DD-<series-id>-NN`) members.
 */
export function cmdNextId(project: string, seriesId: string, count: number): number {
  if (invalidSegments([["project", project]])) return 1;
  const rest = seriesId.replace(/-[0-9]{2}$/, "");
  const reason = standaloneReason(rest);
  if (reason !== "") {
    const shown = rest.replaceAll("\n", "\\n").replaceAll("\r", "\\r");
    process.stderr.write(`invalid change id '${shown}': ${reason}\n`);
    return 1;
  }

  const changes = join(thewayHome(), project, "changes");
  const active = new RegExp(`^${rest}-([0-9]{2})$`);
  const archived = new RegExp(`^[0-9]{4}-[0-9]{2}-[0-9]{2}-${rest}-([0-9]{2})$`);
  let max = 0;
  for (const [dir, pattern] of [
    [changes, active],
    [join(changes, "archive"), archived],
  ] as const) {
    for (const name of dirs(dir)) {
      const m = pattern.exec(name);
      if (m !== null) max = Math.max(max, Number(m[1]));
    }
  }
  if (max + count > 99) {
    process.stderr.write(`theway: series ${rest} would go past -99\n`);
    return 1;
  }
  let out = "";
  for (let n = max + 1; n <= max + count; n++) out += `${rest}-${String(n).padStart(2, "0")}\n`;
  process.stdout.write(out);
  return 0;
}
