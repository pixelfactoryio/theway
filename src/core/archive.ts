import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { isDir, isFile, thewayHome } from "./io";
import { UNCHECKED } from "./list";
import { invalidChangeId } from "./path";
import { projectDir, resolveKey } from "./project";

function localDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The unchecked numbered task lines as `<n>:<line>`. */
function uncheckedLines(path: string): string[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .flatMap((line, i) => (UNCHECKED.test(line) ? [`${i + 1}:${line}`] : []));
}

/** `theway archive <change-id> [--project <key>] [--force]`: moves a change to `changes/archive/<date>-<change-id>`. */
export function cmdArchive(changeId: string, override: string | undefined, force: boolean): number {
  const key = resolveKey(override);
  if (key === null) return 1;
  if (invalidChangeId(changeId)) return 1;
  const dir = projectDir(thewayHome(), key);
  const src = `${dir}/changes/${changeId}`;
  const dst = `${dir}/changes/archive/${localDate()}-${changeId}`;
  if (!isDir(src)) {
    process.stderr.write(`Error: ${src} not found\n`);
    return 1;
  }
  if (existsSync(dst)) {
    process.stderr.write(`Error: ${dst} already exists — not archiving.\n`);
    return 1;
  }

  if (isFile(`${src}/tasks.md`)) {
    const unchecked = uncheckedLines(`${src}/tasks.md`);
    if (unchecked.length > 0) {
      const list = `${unchecked.join("\n")}\n`;
      if (force) {
        process.stderr.write(`WARNING: archiving with unchecked tasks (--force):\n${list}`);
      } else {
        process.stderr.write(`Error: ${changeId} has unchecked tasks — not archiving.\n${list}`);
        process.stderr.write("Complete or tick them in tasks.md, or re-run with --force.\n");
        return 1;
      }
    }
  }

  try {
    mkdirSync(`${dir}/changes/archive`, { recursive: true });
    renameSync(src, dst);
  } catch (e) {
    process.stderr.write(`mv: ${(e as Error).message}\n`);
    return 1;
  }
  process.stdout.write(`Archived: ${dst}\n`);
  return 0;
}
