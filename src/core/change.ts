/** A change's `change.yaml`: its description and ordered tasks, validated on every read; `theway change` and `theway task done`. */
import { accessSync, constants, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CHANGE_FILE, type Change, type ChangeTask, checkChangeText, editedChangeText } from "./change-text";
import { escaped, isFile, thewayHome, writeAtomic } from "./io";
import { invalidChangeId } from "./path";
import { projectDir, resolveKey } from "./project";

export { CHANGE_FILE, CHANGE_VERSION, type Change, type ChangeTask } from "./change-text";

/** The path of a change's file relative to its project folder, as error lines name it. */
export const changeRel = (id: string): string => `changes/${id}/${CHANGE_FILE}`;

/**
 * The change of the folder `dir`, or every reason its `change.yaml` is invalid: `<where>: <message>`, or `<message>`
 * alone for a file-level rule; collected in the file's key order, then the missing keys.
 */
export function checkChange(dir: string): { change: Change } | { issues: string[] } {
  const path = join(dir, CHANGE_FILE);
  let text: string;
  try {
    if (!isFile(path)) return { issues: ["not found"] };
    text = readFileSync(path, "utf-8");
  } catch {
    return { issues: ["not found"] };
  }
  return checkChangeText(text);
}

/** The error lines of `issues` for the change `id`: `changes/<id>/change.yaml: <issue>`. */
export const issueLines = (id: string, issues: string[]): string[] => issues.map((issue) => `${changeRel(id)}: ${issue}`);

/** The number of regular, non-hidden files directly in a change folder: `<files>` of `theway list`. */
export function changeFileCount(dir: string): number {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  return names.filter((n) => !n.startsWith(".") && isFile(join(dir, n))).length;
}

/**
 * Sets `done: true` on the tasks numbered `numbers` (from 1) of the change `id` in `dir` through `editedChangeText`, one
 * task after the other, and writes the last text once, keeping the file's mode; writes nothing when the file is invalid,
 * an argument is not a task number or names no task, an edit is refused, or the file cannot be written. Returns the error
 * lines, or the counts after.
 */
export function tickTasks(dir: string, id: string, numbers: string[]): { errors: string[] } | { done: number; total: number } {
  const c = checkChange(dir);
  if ("issues" in c) return { errors: issueLines(id, c.issues) };
  const total = c.change.tasks.length;
  const errors = numbers.flatMap((n) => {
    if (!/^[1-9][0-9]*$/.test(n)) return [`${changeRel(id)}: task ${escaped(n)}: not a task number`];
    return Number(n) > total ? [`${changeRel(id)}: task ${n}: no such task (1 to ${total})`] : [];
  });
  if (errors.length > 0) return { errors };

  const todo = [...new Set(numbers.map(Number))].filter((n) => !(c.change.tasks[n - 1] as ChangeTask).done);
  if (todo.length > 0) {
    const path = join(dir, CHANGE_FILE);
    let text = readFileSync(path, "utf-8");
    for (const n of todo) {
      const edited = editedChangeText(text, { kind: "done", index: n - 1, done: true });
      if ("reason" in edited) return { errors: [`${changeRel(id)}: ${edited.reason}`] };
      text = edited.text;
    }
    try {
      accessSync(path, constants.W_OK);
      writeAtomic(path, text, statSync(path).mode & 0o777);
    } catch (e) {
      return { errors: [`${changeRel(id)}: cannot write: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
  const done = c.change.tasks.filter((t, i) => t.done || todo.includes(i + 1)).length;
  return { done, total };
}

/** The project's folder of the change `id`, or `null` after writing why the project or the ID is invalid. */
function changeDir(changeId: string, override: string | undefined): string | null {
  const key = resolveKey(override);
  if (key === null) return null;
  if (invalidChangeId(changeId)) return null;
  return join(projectDir(thewayHome(), key), "changes", changeId);
}

const fail = (lines: string[]): number => {
  for (const line of lines) process.stderr.write(`theway: ${line}\n`);
  return 1;
};

/** `theway change <change-id> [--project <key>]`: validates `change.yaml` and prints the change as JSON. */
export function cmdChange(changeId: string, override: string | undefined): number {
  const dir = changeDir(changeId, override);
  if (dir === null) return 1;
  const c = checkChange(dir);
  if ("issues" in c) return fail(issueLines(changeId, c.issues));
  const tasks = c.change.tasks.map((t, i) => ({ n: i + 1, text: t.text, done: t.done }));
  process.stdout.write(`${JSON.stringify({ id: changeId, dir, description: c.change.description, tasks }, null, 2)}\n`);
  return 0;
}

/** `theway task done <change-id> <n>... [--project <key>]`: ticks the tasks numbered `<n>`. */
export function cmdTaskDone(changeId: string, numbers: string[], override: string | undefined): number {
  const dir = changeDir(changeId, override);
  if (dir === null) return 1;
  const r = tickTasks(dir, changeId, numbers);
  if ("errors" in r) return fail(r.errors);
  process.stdout.write(`${r.done}/${r.total} tasks done\n`);
  return 0;
}
