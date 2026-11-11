import { existsSync, mkdirSync, renameSync } from "node:fs";
import { checkChange, issueLines } from "./change";
import { isDir, thewayHome } from "./io";
import { invalidChangeId } from "./path";
import { projectDir, resolveKey } from "./project";

function localDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

  const c = checkChange(src);
  if ("issues" in c) {
    if (force) {
      process.stderr.write("WARNING: archiving with an invalid change.yaml (--force)\n");
    } else {
      process.stderr.write(`Error: ${changeId} has an invalid change.yaml — not archiving.\n`);
      for (const line of issueLines(changeId, c.issues)) process.stderr.write(`${line}\n`);
      process.stderr.write("Fix it, or re-run with --force.\n");
      return 1;
    }
  } else {
    const open = c.change.tasks.flatMap((t, i) => (t.done ? [] : [`${i + 1}. ${t.text.split("\n")[0]}\n`]));
    if (open.length > 0) {
      if (force) {
        process.stderr.write(`WARNING: archiving with open tasks (--force):\n${open.join("")}`);
      } else {
        process.stderr.write(`Error: ${changeId} has open tasks — not archiving.\n${open.join("")}`);
        process.stderr.write("Tick them with theway task done, or re-run with --force.\n");
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
