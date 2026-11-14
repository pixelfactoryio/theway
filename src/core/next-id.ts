import { escaped, thewayHome } from "./io";
import { resolveKey } from "./project";
import { fileStore } from "./store/files";
import { formatReason } from "./validate-id";

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
 * after the highest ordinal among the active and the dated archived members (`<series-id>-NN`).
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

  const store = fileStore(thewayHome());
  const member = new RegExp(`^${rest}-([0-9]{2})$`);
  const archived = store.archived(key).flatMap((e) => (e.id === null ? [] : [e.id]));
  let max = 0;
  for (const id of [...store.activeIds(key), ...archived]) {
    const m = member.exec(id);
    if (m !== null) max = Math.max(max, Number(m[1]));
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
