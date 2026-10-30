import { readdirSync, readFileSync } from "node:fs";
import { isDir, isFile, thewayHome } from "./io";
import { invalidSegments } from "./path";

// Only numbered lines (`N.` or `Na.`) are tasks; other checkboxes are not.
const CHECKED = /^\s*-\s*\[x\]\s+[0-9]+[a-z]?\./;
export const UNCHECKED = /^\s*-\s*\[ \]\s+[0-9]+[a-z]?\./;

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

/** The names matched by the glob `<dir>/*<suffix>` that are regular files. */
function filesEndingWith(dir: string, suffix: string): string[] {
  return visibleNames(dir).filter((n) => n.endsWith(suffix) && isFile(`${dir}/${n}`));
}

/** The active change ids of a project, in `theway list` order (archive excluded). */
function activeIds(home: string, project: string): string[] {
  return subdirs(`${home}/${project}/changes`).filter((n) => n !== "archive");
}

/** The archived change folder names of a project, oldest first. */
function archiveDirs(home: string, project: string): string[] {
  return subdirs(`${home}/${project}/changes/archive`);
}

function taskCounts(dir: string): [number, number] {
  let checked = 0;
  let total = 0;
  if (!isFile(`${dir}/tasks.md`)) return [0, 0];
  for (const line of readFileSync(`${dir}/tasks.md`, "utf-8").split("\n")) {
    if (CHECKED.test(line)) {
      checked++;
      total++;
    } else if (UNCHECKED.test(line)) {
      total++;
    }
  }
  return [checked, total];
}

export function cmdList(project: string): number {
  if (invalidSegments([["project", project]])) return 1;
  const home = thewayHome();
  const base = `${home}/${project}/changes`;
  let text = `theway changes — ${project}\n\nActive changes\n\n`;

  const active = activeIds(home, project);
  for (const name of active) {
    const dir = `${base}/${name}`;
    const files = filesEndingWith(dir, ".md").length;
    const [checked, total] = taskCounts(dir);
    text += `  ${name.padEnd(20)} ${files} files   ${checked}/${total} tasks done\n`;
  }
  if (active.length === 0) text += "  No active changes.\n";
  text += "\n";

  const archived = archiveDirs(home, project);
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
