/** A change's `change.yaml`: its description and ordered tasks, validated on every read; `theway change` and `theway task done`. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isMap as isYamlMap, isScalar, isSeq, parseDocument } from "yaml";
import { escaped, isFile, thewayHome, writeAtomic } from "./io";
import { parseYaml } from "./language";
import { invalidChangeId } from "./path";
import { projectDir, resolveKey } from "./project";

export const CHANGE_VERSION = "theway.change/v1beta";
export const CHANGE_FILE = "change.yaml";

const ROOT_KEYS = ["version", "description", "tasks"];
const TASK_KEYS = ["text", "done"];

export type ChangeTask = { text: string; done: boolean };
export type Change = { description: string; tasks: ChangeTask[] };

const isMap = (v: unknown): v is Map<unknown, unknown> => v instanceof Map;
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** The path of a change's file relative to its project folder, as error lines name it. */
export const changeRel = (id: string): string => `changes/${id}/${CHANGE_FILE}`;

/** A task's `[where, message]` errors, in its key order, then its missing keys. */
function taskIssues(v: unknown, at: string): string[] {
  if (!isMap(v)) return [`${at}: must be a map`];
  const out: string[] = [];
  for (const [k, value] of v) {
    const key = String(k);
    if (key === "text") {
      if (!nonEmpty(value)) out.push(`${at}.text: must be a non-empty string`);
    } else if (key === "done") {
      if (typeof value !== "boolean") out.push(`${at}.done: must be true or false`);
    } else {
      out.push(`${at}.${escaped(key)}: unknown key`);
    }
  }
  if (!v.has("text")) out.push(`${at}.text: is required`);
  return out;
}

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
  const parsed = parseYaml(text);
  if ("reason" in parsed) return { issues: [parsed.reason] };
  const root = parsed.root;
  if (!isMap(root)) return { issues: ["must be a map"] };

  const issues: string[] = [];
  for (const [k, value] of root) {
    const key = String(k);
    if (key === "version") {
      if (value !== CHANGE_VERSION) issues.push(`version: must be ${CHANGE_VERSION}`);
    } else if (key === "description") {
      if (!nonEmpty(value) || /[\r\n]/.test(value)) issues.push("description: must be a non-empty string on one line");
    } else if (key === "tasks") {
      if (!Array.isArray(value) || value.length === 0) issues.push("tasks: must be a list with at least one task");
      else value.forEach((t, i) => issues.push(...taskIssues(t, `tasks[${i}]`)));
    } else {
      issues.push(`${escaped(key)}: unknown key`);
    }
  }
  for (const key of ROOT_KEYS) if (!root.has(key)) issues.push(`${key}: is required`);
  if (issues.length > 0) return { issues };

  const tasks = (root.get("tasks") as Map<unknown, unknown>[]).map((t) => ({ text: t.get("text") as string, done: t.get("done") === true }));
  return { change: { description: root.get("description") as string, tasks } };
}

/** The error lines of `issues` for the change `id`: `changes/<id>/change.yaml: <issue>`. */
export const issueLines = (id: string, issues: string[]): string[] => issues.map((issue) => `${changeRel(id)}: ${issue}`);

/** The number of regular, non-hidden files directly in a change folder: `<files>` of `theway list` and the dashboard. */
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
 * The text of a valid `change.yaml` with `done: true` set on the tasks at the 0-based `indexes`, spliced into the source
 * at the `yaml` Document's node ranges so every other byte is kept (`toString` would refold multi-line scalars and
 * comment spacing): an existing `done` value is replaced, otherwise `done: true` goes after the task's last value, on
 * its own line at the task's key indent (`, done: true` in a flow map).
 */
function tickedText(text: string, indexes: number[]): string {
  const seq = parseDocument(text).get("tasks", true);
  if (!isSeq(seq)) throw new Error("tasks: not a sequence");
  const edits: { at: number; end: number; insert: string }[] = [];
  for (const i of indexes) {
    const task = seq.items[i];
    if (!isYamlMap(task)) throw new Error(`tasks[${i}]: not a map`);
    const done = task.items.find((p) => isScalar(p.key) && p.key.value === "done");
    if (done && isScalar(done.value) && done.value.range) {
      edits.push({ at: done.value.range[0], end: done.value.range[1], insert: "true" });
      continue;
    }
    const last = task.items[task.items.length - 1];
    const first = task.items[0];
    const end = (last?.value as { range?: [number, number, number] } | null)?.range?.[1];
    const keyStart = (first?.key as { range?: [number, number, number] } | null)?.range?.[0];
    if (end === undefined || keyStart === undefined) throw new Error(`tasks[${i}]: no source range`);
    if (task.flow) {
      edits.push({ at: end, end, insert: ", done: true" });
      continue;
    }
    const indent = " ".repeat(keyStart - (text.lastIndexOf("\n", keyStart - 1) + 1));
    if (text[end - 1] === "\n") {
      edits.push({ at: end, end, insert: `${indent}done: true\n` });
    } else {
      const nl = text.indexOf("\n", end);
      if (nl === -1) edits.push({ at: text.length, end: text.length, insert: `\n${indent}done: true` });
      else edits.push({ at: nl + 1, end: nl + 1, insert: `${indent}done: true\n` });
    }
  }
  let out = text;
  for (const e of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, e.at) + e.insert + out.slice(e.end);
  return out;
}

/**
 * Sets `done: true` on the tasks numbered `numbers` (from 1) of the change `id` in `dir`, keeping the rest of the file's
 * text; writes nothing when the file is invalid or a number names no task. Returns the error lines, or the counts after.
 */
export function tickTasks(dir: string, id: string, numbers: string[]): { errors: string[] } | { done: number; total: number } {
  const c = checkChange(dir);
  if ("issues" in c) return { errors: issueLines(id, c.issues) };
  const total = c.change.tasks.length;
  const errors = numbers
    .filter((n) => !/^[1-9][0-9]*$/.test(n) || Number(n) > total)
    .map((n) => `${changeRel(id)}: task ${escaped(n)}: no such task (1 to ${total})`);
  if (errors.length > 0) return { errors };

  const todo = [...new Set(numbers.map(Number))].filter((n) => !(c.change.tasks[n - 1] as ChangeTask).done);
  if (todo.length > 0) {
    const path = join(dir, CHANGE_FILE);
    writeAtomic(path, tickedText(readFileSync(path, "utf-8"), todo.map((n) => n - 1)));
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
