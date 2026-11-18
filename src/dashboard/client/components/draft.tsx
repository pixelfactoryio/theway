import { useQueryClient } from "@tanstack/react-query"
import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { ChangeDialogs, type Confirm } from "@/components/change-dialogs"
import { type CodeLanguage, DraftStore, draftState } from "@/components/code-view"
import { type AlertLine, ErrorStrip, SavedStatus, STRIP } from "@/components/file-page"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"
import { leavesPage } from "@/lib/edit"
import {
  type CheckBody,
  CheckBodySchema,
  type FileBody,
  FileBodySchema,
  type FileError,
  fileApi,
  type PromptRow,
  SavedSchema,
} from "@/lib/files"
import { failureOf, sendJson } from "@/shell/api"
import { setLeaveGuard, useBeforeUnload } from "@/shell/guard"
import { MAC } from "@/shell/platform"
import { getJson } from "@/shell/projects"

/** The header fields a check answers for a prompt, as a row of `GET /api/prompts` gives them. */
export type HeaderFields = Pick<PromptRow, "header" | "description" | "model" | "inputs">

/** A check answer applied to the page: the text it checked, its lines and, for a prompt, its header fields. */
type CheckResult = { text: string; errors: FileError[]; header: HeaderFields | null }

type Outcome = { ok: true; errors: FileError[]; header: HeaderFields | null } | { ok: false; error: string }

/** What the page loaded, or last saved: the file's text, its version and the lines of that text. */
type Loaded = { text: string; version: string; result: CheckResult }

/** How long after the last edit the draft is checked. */
const CHECK_DELAY = 400

const noop = (): (() => void) => () => undefined

const headerOf = (body: CheckBody): HeaderFields => ({
  header: body.header === true,
  description: body.description ?? null,
  model: body.model ?? null,
  inputs: body.inputs ?? [],
})

/**
 * A file page's draft: created when the page loads the file and kept while the page is open. It checks the draft
 * 400ms after the last edit, saves it, discards it, reloads the file, restores a version, and guards leaving the page
 * while the draft differs from the file.
 */
export function useFileDraft({
  kind,
  project,
  name,
  file,
  fetching,
  language,
  docName,
}: {
  kind: "workflows" | "prompts"
  project: string | null
  name: string
  file: FileBody | undefined
  fetching: boolean
  language: CodeLanguage
  docName: string
}) {
  const queryClient = useQueryClient()
  const api = fileApi(kind, project, name)
  const [store, setStore] = useState<DraftStore | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [checkFailure, setCheckFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saveFailure, setSaveFailure] = useState<string | null>(null)
  const [details, setDetails] = useState<HeaderFields | null>(null)
  const [savedDoc, setSavedDoc] = useState<unknown>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [saving, setSaving] = useState(false)

  // The page owns what it loaded: the first answer of the file's route once no refetch is running; a later refetch
  // changes nothing here.
  if (store === null && file !== undefined && !fetching) {
    const first: Loaded = {
      text: file.text,
      version: file.version,
      result: { text: file.text, errors: file.errors, header: null },
    }
    setStore(new DraftStore(draftState(file.text, language, docName)))
    setLoaded(first)
    setResult(first.result)
  }

  const state = useSyncExternalStore(store?.subscribe ?? noop, () => store?.state ?? null)
  const doc = state?.doc
  const lineBreak = state?.lineBreak
  // A draft's text is always read with the state's line break: `sliceDoc()`, or `doc.sliceString` with `lineBreak`
  // here, so a selection-only change does not slice the text again.
  const text = useMemo(() => (doc === undefined ? null : doc.sliceString(0, doc.length, lineBreak)), [doc, lineBreak])
  const dirty = text !== null && loaded !== null && text !== loaded.text

  // A draft equal to the file shows the prompt's row again.
  if (!dirty && details !== null) setDetails(null)

  const refs = useRef({ store, loaded, result, checkFailure, dirty })
  // The callbacks read the latest store, result and dirty state without being recreated.
  useLayoutEffect(() => {
    refs.current = { store, loaded, result, checkFailure, dirty }
  })
  const inFlight = useRef(new Map<string, Promise<Outcome>>())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // One save at a time: a second one would send the same base and be refused as a change on disk.
  const savingNow = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimeout(timer.current)
    }
  }, [])

  /** Applies a check answer only when the text it checked is still the draft. */
  const apply = useCallback((checked: string, outcome: Outcome) => {
    const { store: s, loaded: l } = refs.current
    if (!mounted.current || s === null || s.state.sliceDoc() !== checked) return
    if (!outcome.ok) {
      setCheckFailure(outcome.error)
      return
    }
    setResult({ text: checked, errors: outcome.errors, header: outcome.header })
    setCheckFailure(null)
    setDetails(l !== null && checked !== l.text ? outcome.header : null)
  }, [])

  /** The check of `checked`: the one in flight for that text, else a new one. */
  const runCheck = useCallback(
    (checked: string): Promise<Outcome> => {
      const running = inFlight.current.get(checked)
      if (running !== undefined) return running
      const p = sendJson("POST", "/api/check", { kind, project, name, text: checked }, CheckBodySchema).then(
        (r): Outcome =>
          r.status === 200 && r.body !== null
            ? { ok: true, errors: r.body.errors, header: kind === "prompts" ? headerOf(r.body) : null }
            : { ok: false, error: failureOf(r) },
      )
      inFlight.current.set(checked, p)
      void p.then((outcome) => {
        inFlight.current.delete(checked)
        apply(checked, outcome)
      })
      return p
    },
    [kind, project, name, apply],
  )

  // 400ms after the last edit, the draft is checked.
  useEffect(() => {
    if (text === null) return
    const { result: r, checkFailure: failed } = refs.current
    if (r !== null && r.text === text && failed === null) return
    const t = setTimeout(() => void runCheck(text), CHECK_DELAY)
    timer.current = t
    return () => clearTimeout(t)
  }, [text, runCheck])

  const invalidate = useCallback(() => {
    for (const key of [["workflows"], ["prompts"], ["history", api], ["file", api]])
      void queryClient.invalidateQueries({ queryKey: key })
  }, [queryClient, api])

  /**
   * Writes the draft. With `ask`, it first waits for the check of the current draft and asks before saving one with
   * errors; a check that cannot run asks nothing. True once written.
   */
  const write = useCallback(
    async (ask: boolean): Promise<boolean> => {
      const { store: s, loaded: l } = refs.current
      if (s === null || l === null) return false
      const savedState = s.state
      const draft = savedState.sliceDoc()
      let outcome: Outcome | null = null
      if (ask) {
        // The check awaited here stands for the pending one. Without `ask` the pending check still runs, so a failed
        // save leaves the current draft's lines shown.
        clearTimeout(timer.current)
        const r = refs.current.result
        outcome =
          r !== null && r.text === draft && refs.current.checkFailure === null
            ? { ok: true, errors: r.errors, header: r.header }
            : await runCheck(draft)
        if (outcome.ok && outcome.errors.length > 0) {
          const n = outcome.errors.length
          const yes = await new Promise<boolean>((answer) => setConfirm({ kind: "errors", n, answer }))
          if (!yes) return false
        }
      }
      setSaveFailure(null)
      const res = await sendJson("PUT", api, { text: draft, base: l.version }, SavedSchema)
      if (res.status === 200 && res.body !== null) {
        const r = refs.current.result
        const lines: CheckResult =
          outcome !== null && outcome.ok
            ? { text: draft, errors: outcome.errors, header: outcome.header }
            : r !== null && r.text === draft
              ? r
              : { text: draft, errors: [], header: null }
        setLoaded({ text: draft, version: res.body.version, result: lines })
        setConflict(false)
        setSavedDoc(savedState.doc)
        invalidate()
        return true
      }
      if (res.status === 409) setConflict(true)
      else setSaveFailure(failureOf(res))
      return false
    },
    [api, runCheck, invalidate],
  )

  /** `write`, one at a time: a save asked while one runs does nothing and gives false. */
  const save = useCallback(
    async (ask: boolean): Promise<boolean> => {
      if (savingNow.current) return false
      savingNow.current = true
      setSaving(true)
      try {
        return await write(ask)
      } finally {
        savingNow.current = false
        if (mounted.current) setSaving(false)
      }
    },
    [write],
  )

  /** A new state from the file's text, with an empty undo history. */
  const reset = useCallback(
    (l: Loaded) => {
      refs.current.store?.replace(draftState(l.text, language, docName))
      setResult(l.result)
      setCheckFailure(null)
      setDetails(null)
    },
    [language, docName],
  )

  const doDiscard = useCallback(() => {
    const l = refs.current.loaded
    if (l !== null) reset(l)
  }, [reset])

  /** Loads the file again and drops the draft. */
  const doReload = useCallback(async (): Promise<boolean> => {
    let fresh: FileBody
    try {
      fresh = await getJson(api, FileBodySchema)
    } catch {
      return false
    }
    queryClient.setQueryData(["file", api], fresh)
    const l: Loaded = {
      text: fresh.text,
      version: fresh.version,
      result: { text: fresh.text, errors: fresh.errors, header: null },
    }
    setLoaded(l)
    reset(l)
    setConflict(false)
    return true
  }, [api, queryClient, reset])

  /** Writes the version `id` as the file, then reloads it; true once written. */
  const restore = useCallback(
    async (id: string): Promise<boolean> => {
      const l = refs.current.loaded
      if (l === null) return false
      setSaveFailure(null)
      const res = await sendJson("POST", `${api}/history/${id}/restore`, { base: l.version }, SavedSchema)
      if (res.status === 200 && res.body !== null) {
        await doReload()
        invalidate()
        return true
      }
      if (res.status === 409) setConflict(true)
      else setSaveFailure(failureOf(res))
      return false
    },
    [api, doReload, invalidate],
  )

  // Leaving the page with unsaved changes asks first; closing or reloading the tab gets the browser's prompt.
  useEffect(
    () =>
      setLeaveGuard({
        leaves: (target) => leavesPage({ kind, project, name }, target),
        isDirty: () => refs.current.dirty,
        ask: (proceed) => setConfirm({ kind: "leave", proceed }),
      }),
    [kind, project, name],
  )
  useBeforeUnload(dirty)

  return {
    store,
    loaded,
    text,
    dirty,
    /** The lines shown: none after a failed check. */
    errors: checkFailure !== null ? [] : (result?.errors ?? []),
    checkFailure,
    conflict,
    saveFailure,
    details,
    saved: savedDoc !== null && doc === savedDoc,
    confirm,
    setConfirm,
    /** A save is running. */
    saving,
    save,
    discard: () => setConfirm({ kind: "discard", name }),
    doDiscard,
    reload: () => (refs.current.dirty ? setConfirm({ kind: "reload", name }) : void doReload()),
    doReload,
    restore,
  }
}

export type FileDraft = ReturnType<typeof useFileDraft>

/** The strip shown when the file changed on disk since it was opened, with Reload. */
export function ConflictNotice({ onReload }: { onReload: () => void }) {
  return (
    <Alert variant="warning" className={STRIP}>
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>This file changed on disk since you opened it.</AlertTitle>
      <AlertAction>
        <Button variant="outline" size="xs" onClick={onReload}>
          Reload
        </Button>
      </AlertAction>
    </Alert>
  )
}

/** The strip shown when the last save failed, with the reason. */
export function SaveFailureNotice({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className={STRIP}>
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>The file could not be saved</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

/**
 * The stack under the tabs, from the top: the conflict, the save failure, then the check failure or the error alert. On
 * History the error alert is hidden. Unsaved edits show in the footer, with `DraftStatus`.
 */
export function DraftNotices({
  draft,
  lines,
  history,
}: {
  draft: FileDraft
  lines: readonly AlertLine[]
  history: boolean
}) {
  return (
    <>
      {draft.conflict ? <ConflictNotice onReload={draft.reload} /> : null}
      {draft.saveFailure !== null ? <SaveFailureNotice message={draft.saveFailure} /> : null}
      {draft.checkFailure !== null ? (
        <Alert variant="destructive" className={STRIP}>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>The check could not run</AlertTitle>
          <AlertDescription>{draft.checkFailure}</AlertDescription>
        </Alert>
      ) : history ? null : (
        <ErrorStrip lines={lines} />
      )}
    </>
  )
}

/**
 * A footer's save state: `Unsaved · ⌘S to save` (Ctrl+S off macOS) with Discard when `onDiscard` is given, while
 * `dirty`; else Saved for a moment after a save.
 */
export function DraftStatus({ dirty, saved, onDiscard }: { dirty: boolean; saved: boolean; onDiscard?: () => void }) {
  if (!dirty) return <SavedStatus saved={saved} />
  return (
    <span className="flex items-center gap-2">
      <span className="text-foreground">Unsaved · {MAC ? "⌘S" : "Ctrl+S"} to save</span>
      {onDiscard !== undefined ? (
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Discard
        </button>
      ) : null}
    </span>
  )
}

/** The page's confirmations: Discard, Save with errors, Reload and leaving the page. */
export function DraftDialogs({ draft }: { draft: FileDraft }) {
  return (
    <ChangeDialogs
      confirm={draft.confirm}
      setConfirm={draft.setConfirm}
      onDiscard={draft.doDiscard}
      onReload={() => void draft.doReload()}
      onLeaveSave={(proceed) => {
        draft.setConfirm(null)
        void draft.save(false).then((ok) => {
          if (ok) proceed()
        })
      }}
    />
  )
}
