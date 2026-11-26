import type { EditorState } from "@codemirror/state"
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"

import type { Sent } from "@/data/api"
import { DraftSet, type Loaded, type Outcome, type SyncedFile } from "@/drafts/draft-set"
import type { FileError } from "@/lib/files"
import { setLeaveGuard, useBeforeUnload } from "@/shell/guard"

/** The confirmation open on the page. */
export type Confirm =
  | { kind: "discard"; name: string }
  | { kind: "reload"; name: string }
  | { kind: "errors"; n: number; answer: (yes: boolean) => void }
  | { kind: "leave"; proceed: () => void }

export type DraftsOptions = {
  /** The route's files, taken by `DraftSet.sync`. */
  files: readonly SyncedFile[]
  stateOf: (name: string, text: string) => EditorState
  put: (name: string, text: string, base: string) => Promise<Sent<{ version: string }>>
  check?: (name: string, text: string) => Promise<Outcome>
  /** Loads the file `name` again: its text, version and lines, or why it could not. */
  refetch: (name: string) => Promise<(Loaded & { errors?: FileError[] }) | string>
  /** The number of errors of `text`, the draft of `name`: Save with `ask` asks first when it is above 0. */
  errorCount: (name: string, text: string) => number | Promise<number>
  /** Whether an address path leaves the page. */
  leaves: (target: string) => boolean
  /** Unsaved changes held outside the drafts. */
  extraDirty?: () => boolean
  /** Called after every save that answers true. */
  onSaved?: (name: string) => void
  /** Called after every Discard. */
  onDiscarded?: (name: string) => void
  /** Called after every Reload that answers true. */
  onReloaded?: (name: string) => void
  /** The files in the order Leave saves them. */
  order: readonly string[]
}

/**
 * A page's drafts, one `DraftSet` made once per page, with the page's confirmations (Discard, Reload, Save with errors
 * and leaving), the leave guard and the browser's prompt while a draft or `extraDirty` holds unsaved changes.
 */
export function useDrafts(options: DraftsOptions) {
  // The latest options, for the set's callbacks and the handlers.
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })
  // Made once per page, from the first render's `stateOf`, `put` and `check`.
  const [set] = useState(() => new DraftSet({ stateOf: options.stateOf, put: options.put, check: options.check }))
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const { files } = options
  if (set.names().length === 0 && files.length > 0) set.sync(files)
  useEffect(() => set.sync(files), [set, files])
  const version = useSyncExternalStore(set.subscribe, set.getVersion)

  // Every change of a draft arms its check.
  useEffect(() => {
    for (const name of set.names()) set.edited(name)
  }, [set, version])
  useEffect(() => () => set.dispose(), [set])

  /** Writes the draft `name`; with `ask`, asks "Save anyway" first when its text has errors. True once written. */
  const save = useCallback(
    async (name: string, ask: boolean): Promise<boolean> => {
      if (ask) {
        const text = set.text(name)
        const n = text === null ? 0 : await latest.current.errorCount(name, text)
        if (n > 0 && !(await new Promise<boolean>((answer) => setConfirm({ kind: "errors", n, answer })))) return false
      }
      const ok = await set.save(name)
      if (ok) latest.current.onSaved?.(name)
      return ok
    },
    [set],
  )

  /** Drops the draft `name` without asking. */
  const doDiscard = useCallback(
    (name: string): void => {
      set.discard(name)
      latest.current.onDiscarded?.(name)
    },
    [set],
  )

  /** Loads the file `name` again and drops its draft, without asking; a failure shows as the save failure. */
  const doReload = useCallback(
    async (name: string): Promise<boolean> => {
      const fresh = await latest.current.refetch(name)
      if (typeof fresh === "string") {
        set.fail(name, fresh)
        return false
      }
      set.reload(name, fresh)
      latest.current.onReloaded?.(name)
      return true
    },
    [set],
  )

  /** Asks before dropping the draft `name`. */
  const discard = useCallback((name: string): void => setConfirm({ kind: "discard", name }), [])

  /** Reloads the file `name`, asking first when its draft differs from it. */
  const reload = useCallback(
    (name: string): void => {
      if (set.isDirty(name)) setConfirm({ kind: "reload", name })
      else void doReload(name)
    },
    [set, doReload],
  )

  /** Writes every dirty draft in `order`, stopping at the first failure; its name, or null once all are written. */
  const saveAll = useCallback(async (): Promise<string | null> => {
    for (const name of latest.current.order) {
      if (set.isDirty(name) && !(await save(name, false))) return name
    }
    return null
  }, [set, save])

  // Leaving the page with unsaved changes asks first; closing or reloading the tab gets the browser's prompt.
  useEffect(
    () =>
      setLeaveGuard({
        leaves: (target) => latest.current.leaves(target),
        isDirty: () => set.anyDirty() || latest.current.extraDirty?.() === true,
        ask: (proceed) => setConfirm({ kind: "leave", proceed }),
      }),
    [set],
  )
  // Read in an effect, after the page's layout effects have stored this render's state for `extraDirty`; during render
  // it would see the previous render's.
  const [pending, setPending] = useState(false)
  // Set only when it changes: a same value set while the page still has a render queued (each keystroke has one) costs
  // a render of its own, and keystrokes faster than that render chain those renders until React stops at its update
  // depth limit (error #185).
  const setTo = useRef(false)
  const { extraDirty } = options
  useEffect(() => {
    const next = set.anyDirty() || extraDirty?.() === true
    if (next === setTo.current) return
    setTo.current = next
    setPending(next)
  }, [set, version, extraDirty])
  useBeforeUnload(pending)

  return { set, confirm, setConfirm, save, discard, doDiscard, reload, doReload, saveAll }
}

export type Drafts = ReturnType<typeof useDrafts>
