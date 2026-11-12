import { readdirSync } from "node:fs";
import { changeFileCount, checkChange } from "./change";
import { isDir, thewayHome } from "./io";
import { projectDir, resolveKey } from "./project";

function visibleNames(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => !n.startsWith("."));
  } catch {
    return [];
  }
}

/** The names matched by the glob `<dir>/*` + `/`: non-hidden directories, symlinks followed. */
function subdirs(dir: string): string[] {
  return visibleNames(dir)
    .filter((n) => isDir(`${dir}/${n}`))
    .sort();
}

/** The active change ids of a project, in `theway list` order (archive excluded). */
export function activeIds(dir: string): string[] {
  return subdirs(`${dir}/changes`).filter((n) => n !== "archive");
}

/** The archived change folder names of a project, oldest first. */
export function archiveDirs(dir: string): string[] {
  return subdirs(`${dir}/changes/archive`);
}

/** `theway list [--project <key>]`: the active and archived changes of the project. */
export function cmdList(override: string | undefined): number {
  const key = resolveKey(override);
  if (key === null) return 1;
  const dir = projectDir(thewayHome(), key);
  const base = `${dir}/changes`;
  let text = `theway changes — ${key}\n\nActive changes\n\n`;

  const active = activeIds(dir);
  for (const name of active) {
    const change = `${base}/${name}`;
    const files = changeFileCount(change);
    const c = checkChange(change);
    const state = "issues" in c ? `invalid: ${c.issues[0]}` : `${c.change.tasks.filter((t) => t.done).length}/${c.change.tasks.length} tasks done`;
    text += `  ${name.padEnd(20)} ${files} files   ${state}\n`;
  }
  if (active.length === 0) text += "  No active changes.\n";
  text += "\n";

  const archived = archiveDirs(dir);
  text += `Archived changes (${archived.length})\n\n`;
  if (archived.length > 0) {
    for (const name of archived) text += `  ${name}\n`;
  } else {
    text += "  No archived changes.\n";
  }
  text += `\nSummary: ${active.length} active change(s), ${archived.length} archived.\n`;
  process.stdout.write(text);
  return 0;
}
