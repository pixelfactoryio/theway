import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { isDir, isFile, thewayHome } from "./io";
import { UNCHECKED } from "./list";

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

export function cmdArchive(project: string, changeId: string, force: boolean): number {
  const home = thewayHome();
  const src = `${home}/${project}/changes/${changeId}`;
  const dst = `${home}/${project}/changes/archive/${localDate()}-${changeId}`;
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
    mkdirSync(`${home}/${project}/changes/archive`, { recursive: true });
    renameSync(src, dst);
  } catch (e) {
    process.stderr.write(`mv: ${(e as Error).message}\n`);
    return 1;
  }
  process.stdout.write(`Archived: ${dst}\n`);
  return 0;
}
