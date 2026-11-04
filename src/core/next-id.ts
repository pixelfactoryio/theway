import { readdirSync } from "node:fs";
import { join } from "node:path";
import { escaped, isDir, thewayHome } from "./io";
import { projectDir, resolveKey } from "./project";
import { formatReason } from "./validate-id";

/** The names of the directories directly in `dir`; none when it is missing. */
function dirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => isDir(join(dir, n)));
  } catch {
    return [];
  }
}

/** The reason a series id (its trailing -NN already removed) is invalid, "" when it fits. */
function seriesIdReason(id: string): string {
  const reason = formatReason(id);
  if (reason !== "") return reason;
  const tail = id.slice(id.lastIndexOf("-") + 1);
  if (/^[0-9]{1,2}$/.test(tail)) return `ends in a number (-${tail}); a series id cannot end in a number`;
  return "";
}

/**
 * `theway next-id <series-id> [--count <n>] [--project <key>]`: the next `count` free member ids of a series, one per line,
 * after the highest ordinal among the active (`changes/<series-id>-NN`) and archived (`changes/archive/YYYY-MM-DD-<series-id>-NN`) members.
 */
export function cmdNextId(seriesId: string, count: number, override: string | undefined): number {
  const key = resolveKey(override);
  if (key === null) return 1;
  const rest = seriesId.replace(/-[0-9]{2}$/, "");
  const reason = seriesIdReason(rest);
  if (reason !== "") {
    const shown = escaped(rest);
    process.stderr.write(`invalid change id '${shown}': ${reason}\n`);
    return 1;
  }

  const changes = join(projectDir(thewayHome(), key), "changes");
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
