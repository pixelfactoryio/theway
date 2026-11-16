import { CHANGE_FILE, checkRead, issueLines } from "./change"
import { thewayHome } from "./io"
import { detail, error, print, warning } from "./output"
import { invalidChangeId } from "./path"
import { projectKeyOrExit } from "./project"
import { StoreError } from "./store"
import { fileStore } from "./store/files"

function localDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** `theway archive <change-id> [--project <key>] [--force]`: moves a change to `changes/archive/<date>-<change-id>`. */
export function cmdArchive(changeId: string, override: string | undefined, force: boolean): number {
  const resolved = projectKeyOrExit(override)
  if (typeof resolved === "number") return resolved
  const key = resolved.key
  const invalid = invalidChangeId(changeId)
  if (invalid !== null) return error(invalid)
  const store = fileStore(thewayHome())
  const change = { kind: "active", id: changeId } as const
  const date = localDate()
  const target = { kind: "archived", ref: store.archiveRef(key, changeId, date) } as const
  const taken = (): string => `${store.dirOf(key, target)} already exists — not archiving.`
  if (!store.exists(key, change)) return error(`${store.dirOf(key, change)} not found`)
  if (store.exists(key, target)) return error(taken())

  const c = checkRead(store.readFile(key, change, CHANGE_FILE))
  if ("issues" in c) {
    if (force) {
      warning("archiving with an invalid change.yaml (--force)")
    } else {
      error(`${changeId} has an invalid change.yaml — not archiving.`)
      for (const line of issueLines(changeId, c.issues)) detail(line)
      detail("Fix it, or re-run with --force.")
      return 1
    }
  } else {
    const open = c.change.tasks.flatMap((t, i) => (t.done ? [] : [`${i + 1}. ${t.text.split("\n")[0]}`]))
    if (open.length > 0) {
      if (force) {
        warning("archiving with open tasks (--force):")
        for (const line of open) detail(line)
      } else {
        error(`${changeId} has open tasks — not archiving.`)
        for (const line of open) detail(line)
        detail("Tick them with theway task done, or re-run with --force.")
        return 1
      }
    }
  }

  let ref: string
  try {
    ref = store.archive(key, changeId, date)
  } catch (e) {
    if (e instanceof StoreError && e.code === "exists") return error(taken())
    return error(`cannot move: ${(e as Error).message}`)
  }
  print(`Archived: ${store.dirOf(key, { kind: "archived", ref })}\n`)
  return 0
}
