/** A change's `change.yaml`: its description and ordered tasks, validated on every read; `theway change` and `theway task done`. */
import { CHANGE_FILE, type ChangeCheck, type ChangeTask, checkChangeText, editedChangeText } from "./change-text"
import { thewayHome } from "./io"
import { error, print } from "./output"
import { invalidChangeId } from "./path"
import { projectKeyOrExit } from "./project"
import type { ChangeStore, FileRead } from "./store"
import { fileStore } from "./store/files"
import { escaped } from "./text"

export { CHANGE_FILE } from "./change-text"

/** The path of a change's file relative to its project folder, as error lines name it. */
const changeRel = (id: string): string => `changes/${id}/${CHANGE_FILE}`

/** The check of a `change.yaml` read through the store: `not found` when it is `null`. */
export const checkRead = (read: FileRead | null): ChangeCheck =>
  read === null ? { issues: ["not found"] } : checkChangeText(read.bytes.toString("utf-8"))

/** The error lines of `issues` for the change `id`: `changes/<id>/change.yaml: <issue>`. */
export const issueLines = (id: string, issues: string[]): string[] =>
  issues.map((issue) => `${changeRel(id)}: ${issue}`)

/**
 * Sets `done: true` on the tasks numbered `numbers` (from 1) of the active change `id` through `editedChangeText`, one
 * task after the other, and writes the last text once, keeping the file's mode, against the version it read; writes
 * nothing when the file is invalid, an argument is not a task number or names no task, an edit is refused, the file
 * changed since it was read, or it cannot be written. Returns the error lines, or the counts after.
 */
function tickTasks(
  store: ChangeStore,
  key: string,
  id: string,
  numbers: string[],
): { errors: string[] } | { done: number; total: number } {
  const read = store.readFile(key, { kind: "active", id }, CHANGE_FILE)
  if (read === null) return { errors: issueLines(id, ["not found"]) }
  const c = checkRead(read)
  if ("issues" in c) return { errors: issueLines(id, c.issues) }
  const total = c.change.tasks.length
  const errors = numbers.flatMap((n) => {
    if (!/^[1-9][0-9]*$/.test(n)) return [`${changeRel(id)}: task ${escaped(n)}: not a task number`]
    return Number(n) > total ? [`${changeRel(id)}: task ${n}: no such task (1 to ${total})`] : []
  })
  if (errors.length > 0) return { errors }

  const todo = [...new Set(numbers.map(Number))].filter((n) => !(c.change.tasks[n - 1] as ChangeTask).done)
  if (todo.length > 0) {
    let text = read.bytes.toString("utf-8")
    for (const n of todo) {
      const edited = editedChangeText(text, { kind: "done", index: n - 1, done: true })
      if ("reason" in edited) return { errors: [`${changeRel(id)}: ${edited.reason}`] }
      text = edited.text
    }
    try {
      const written = store.writeFile(key, id, CHANGE_FILE, Buffer.from(text, "utf-8"), read.version)
      if (written.status === "conflict")
        return { errors: [`${changeRel(id)}: changed on disk while ticking; run the command again`] }
    } catch (e) {
      return { errors: [`${changeRel(id)}: cannot write: ${e instanceof Error ? e.message : String(e)}`] }
    }
  }
  const done = c.change.tasks.filter((t, i) => t.done || todo.includes(i + 1)).length
  return { done, total }
}

/** `theway change <change-id> [--project <key>]`: validates `change.yaml` and prints the change as JSON. */
export function cmdChange(changeId: string, override: string | undefined): number {
  const resolved = projectKeyOrExit(override)
  if (typeof resolved === "number") return resolved
  const key = resolved.key
  const invalid = invalidChangeId(changeId)
  if (invalid !== null) return error(invalid)
  const store = fileStore(thewayHome())
  const change = { kind: "active", id: changeId } as const
  const c = checkRead(store.readFile(key, change, CHANGE_FILE))
  if ("issues" in c) {
    for (const line of issueLines(changeId, c.issues)) error(line)
    return 1
  }
  const dir = store.dirOf(key, change)
  const tasks = c.change.tasks.map((t, i) => ({ n: i + 1, text: t.text, done: t.done }))
  print(`${JSON.stringify({ id: changeId, dir, description: c.change.description, tasks }, null, 2)}\n`)
  return 0
}

/** `theway task done <change-id> <n>... [--project <key>]`: ticks the tasks numbered `<n>`. */
export function cmdTaskDone(changeId: string, numbers: string[], override: string | undefined): number {
  const resolved = projectKeyOrExit(override)
  if (typeof resolved === "number") return resolved
  const key = resolved.key
  const invalid = invalidChangeId(changeId)
  if (invalid !== null) return error(invalid)
  const r = tickTasks(fileStore(thewayHome()), key, changeId, numbers)
  if ("errors" in r) {
    for (const line of r.errors) error(line)
    return 1
  }
  print(`${r.done}/${r.total} tasks done\n`)
  return 0
}
