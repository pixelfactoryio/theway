/** A change's `change.yaml`: its description and ordered tasks, validated on every read; `theway change` and `theway task done`. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHANGE_FILE, type Change, type ChangeCheck, type ChangeTask, checkChangeText, editedChangeText } from "./change-text";
import { escaped, isFile, thewayHome } from "./io";
import { invalidChangeId } from "./path";
import { resolveKey } from "./project";
import type { ChangeStore, FileRead } from "./store";
import { fileStore } from "./store/files";

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

/** The check of a `change.yaml` read through the store: `not found` when it is `null`. */
export const checkRead = (read: FileRead | null): ChangeCheck =>
  read === null ? { issues: ["not found"] } : checkChangeText(read.bytes.toString("utf-8"));

/** The error lines of `issues` for the change `id`: `changes/<id>/change.yaml: <issue>`. */
export const issueLines = (id: string, issues: string[]): string[] => issues.map((issue) => `${changeRel(id)}: ${issue}`);

/**
 * Sets `done: true` on the tasks numbered `numbers` (from 1) of the active change `id` through `editedChangeText`, one
 * task after the other, and writes the last text once, keeping the file's mode, against the version it read; writes
 * nothing when the file is invalid, an argument is not a task number or names no task, an edit is refused, the file
 * changed since it was read, or it cannot be written. Returns the error lines, or the counts after.
 */
export function tickTasks(store: ChangeStore, key: string, id: string, numbers: string[]): { errors: string[] } | { done: number; total: number } {
  const read = store.readFile(key, { kind: "active", id }, CHANGE_FILE);
  if (read === null) return { errors: issueLines(id, ["not found"]) };
  const c = checkRead(read);
  if ("issues" in c) return { errors: issueLines(id, c.issues) };
  const total = c.change.tasks.length;
  const errors = numbers.flatMap((n) => {
    if (!/^[1-9][0-9]*$/.test(n)) return [`${changeRel(id)}: task ${escaped(n)}: not a task number`];
    return Number(n) > total ? [`${changeRel(id)}: task ${n}: no such task (1 to ${total})`] : [];
  });
  if (errors.length > 0) return { errors };

  const todo = [...new Set(numbers.map(Number))].filter((n) => !(c.change.tasks[n - 1] as ChangeTask).done);
  if (todo.length > 0) {
    let text = read.bytes.toString("utf-8");
    for (const n of todo) {
      const edited = editedChangeText(text, { kind: "done", index: n - 1, done: true });
      if ("reason" in edited) return { errors: [`${changeRel(id)}: ${edited.reason}`] };
      text = edited.text;
    }
    try {
      const written = store.writeFile(key, id, CHANGE_FILE, Buffer.from(text, "utf-8"), read.version);
      if (written.status === "conflict") return { errors: [`${changeRel(id)}: changed on disk while ticking; run the command again`] };
    } catch (e) {
      return { errors: [`${changeRel(id)}: cannot write: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
  const done = c.change.tasks.filter((t, i) => t.done || todo.includes(i + 1)).length;
  return { done, total };
}

/** The store and the project key of the change `id`, or `null` after writing why the project or the ID is invalid. */
function changeAt(changeId: string, override: string | undefined): { store: ChangeStore; key: string } | null {
  const key = resolveKey(override);
  if (key === null) return null;
  if (invalidChangeId(changeId)) return null;
  return { store: fileStore(thewayHome()), key };
}

const fail = (lines: string[]): number => {
  for (const line of lines) process.stderr.write(`theway: ${line}\n`);
  return 1;
};

/** `theway change <change-id> [--project <key>]`: validates `change.yaml` and prints the change as JSON. */
export function cmdChange(changeId: string, override: string | undefined): number {
  const at = changeAt(changeId, override);
  if (at === null) return 1;
  const change = { kind: "active", id: changeId } as const;
  const c = checkRead(at.store.readFile(at.key, change, CHANGE_FILE));
  if ("issues" in c) return fail(issueLines(changeId, c.issues));
  const dir = at.store.dirOf(at.key, change);
  const tasks = c.change.tasks.map((t, i) => ({ n: i + 1, text: t.text, done: t.done }));
  process.stdout.write(`${JSON.stringify({ id: changeId, dir, description: c.change.description, tasks }, null, 2)}\n`);
  return 0;
}

/** `theway task done <change-id> <n>... [--project <key>]`: ticks the tasks numbered `<n>`. */
export function cmdTaskDone(changeId: string, numbers: string[], override: string | undefined): number {
  const at = changeAt(changeId, override);
  if (at === null) return 1;
  const r = tickTasks(at.store, at.key, changeId, numbers);
  if ("errors" in r) return fail(r.errors);
  process.stdout.write(`${r.done}/${r.total} tasks done\n`);
  return 0;
}
