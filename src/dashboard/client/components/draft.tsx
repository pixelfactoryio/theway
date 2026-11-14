import { useQueryClient } from "@tanstack/react-query"
import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { type CodeLanguage, DraftStore, draftState } from "@/components/code-view"
import { type AlertLine, ErrorStrip } from "@/components/file-page"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { leavesPage, saveWithErrors } from "@/lib/edit"
import { type CheckBody, type FileBody, type FileError, fileApi, type PromptRow } from "@/lib/files"
import { sendJson } from "@/shell/api"
import { setLeaveGuard } from "@/shell/guard"
import { getJson } from "@/shell/projects"

/** The header fields a check answers for a prompt, as a row of `GET /api/prompts` gives them. */
export type HeaderFields = Pick<PromptRow, "header" | "description" | "model" | "inputs">

/** A check answer applied to the page: the text it checked, its lines and, for a prompt, its header fields. */
type CheckResult = { text: string; errors: FileError[]; header: HeaderFields | null }

type Outcome = { ok: true; errors: FileError[]; header: HeaderFields | null } | { ok: false; error: string }

/** What the page loaded, or last saved: the file's text, its version and the lines of that text. */
type Loaded = { text: string; version: string; result: CheckResult }

/** The confirmation open on the page. */
type Confirm =
  | { kind: "discard" }
  | { kind: "reload" }
  | { kind: "errors"; n: number; answer: (yes: boolean) => void }
  | { kind: "leave"; proceed: () => void }

/** How long after the last edit the draft is checked. */
const CHECK_DELAY = 400

const noop = (): (() => void) => () => undefined

const headerOf = (body: Record<string, unknown>): HeaderFields => ({
  header: body.header === true,
  description: typeof body.description === "string" ? body.description : null,
  model: typeof body.model === "string" ? body.model : null,
  inputs: Array.isArray(body.inputs) ? (body.inputs as HeaderFields["inputs"]) : [],
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
    const first: Loaded = { text: file.text, version: file.version, result: { text: file.text, errors: file.errors, header: null } }
    setStore(new DraftStore(draftState(file.text, language, docName)))
    setLoaded(first)
    setResult(first.result)
  }

  const state = useSyncExternalStore(store?.subscribe ?? noop, () => store?.state ?? null)
  const doc = state?.doc
  // A draft's text is `state.sliceDoc()` everywhere.
  const text = useMemo(() => (state === null ? null : state.sliceDoc()), [doc])
  const dirty = text !== null && loaded !== null && text !== loaded.text

  const refs = useRef({ store, loaded, result, checkFailure, dirty })
  refs.current = { store, loaded, result, checkFailure, dirty }
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
      const p = sendJson("POST", "/api/check", { kind, project, name, text: checked }).then(
        (r): Outcome =>
          r.status === 200 && Array.isArray(r.body.errors)
            ? { ok: true, errors: (r.body as CheckBody).errors, header: kind === "prompts" ? headerOf(r.body) : null }
            : { ok: false, error: r.error !== "" ? r.error : `${r.status}` }
      )
      inFlight.current.set(checked, p)
      void p.then((outcome) => {
        inFlight.current.delete(checked)
        apply(checked, outcome)
      })
      return p
    },
    [kind, project, name, apply]
  )

  // 400ms after the last edit, the draft is checked.
  useEffect(() => {
    if (text === null) return
    const { result: r, checkFailure: failed } = refs.current
    if (r !== null && r.text === text && failed === null) return
    const t = setTimeout(() => void runCheck(text), CHECK_DELAY)
    timer.current = t
    return () => clearTimeout(t)
  }, [doc, runCheck])

  // A draft equal to the file shows the prompt's row again.
  useEffect(() => {
    if (!dirty) setDetails(null)
  }, [dirty])

  const invalidate = useCallback(() => {
    for (const key of [["workflows"], ["prompts"], ["history", api], ["file", api]]) void queryClient.invalidateQueries({ queryKey: key })
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
      const res = await sendJson("PUT", api, { text: draft, base: l.version })
      if (res.status === 200 && typeof res.body.version === "string") {
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
      else setSaveFailure(res.error !== "" ? res.error : `${res.status}`)
      return false
    },
    [api, runCheck, invalidate]
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
    [write]
  )

  /** A new state from the file's text, with an empty undo history. */
  const reset = useCallback(
    (l: Loaded) => {
      refs.current.store?.replace(draftState(l.text, language, docName))
      setResult(l.result)
      setCheckFailure(null)
      setDetails(null)
    },
    [language, docName]
  )

  const doDiscard = useCallback(() => {
    const l = refs.current.loaded
    if (l !== null) reset(l)
  }, [reset])

  /** Loads the file again and drops the draft. */
  const doReload = useCallback(async (): Promise<boolean> => {
    let fresh: FileBody
    try {
      fresh = await getJson<FileBody>(api)
    } catch {
      return false
    }
    queryClient.setQueryData(["file", api], fresh)
    const l: Loaded = { text: fresh.text, version: fresh.version, result: { text: fresh.text, errors: fresh.errors, header: null } }
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
      const res = await sendJson("POST", `${api}/history/${id}/restore`, { base: l.version })
      if (res.status === 200) {
        await doReload()
        invalidate()
        return true
      }
      if (res.status === 409) setConflict(true)
      else setSaveFailure(res.error !== "" ? res.error : `${res.status}`)
      return false
    },
    [api, doReload, invalidate]
  )

  // Leaving the page with unsaved changes asks first; closing or reloading the tab gets the browser's prompt.
  useEffect(
    () =>
      setLeaveGuard({
        leaves: (target) => leavesPage({ kind, project, name }, target),
        isDirty: () => refs.current.dirty,
        ask: (proceed) => setConfirm({ kind: "leave", proceed }),
      }),
    [kind, project, name]
  )
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    addEventListener("beforeunload", onBeforeUnload)
    return () => removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

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
    discard: () => setConfirm({ kind: "discard" }),
    doDiscard,
    reload: () => (refs.current.dirty ? setConfirm({ kind: "reload" }) : void doReload()),
    doReload,
    restore,
  }
}

export type FileDraft = ReturnType<typeof useFileDraft>

/** A full-width strip under the tabs: no rounding, the bottom border only. */
const STRIP = "shrink-0 rounded-none border-x-0 border-t-0"

/**
 * The stack under the tabs, from the top: the conflict, the save failure, the unsaved bar, then the check failure or
 * the error alert. On History the unsaved bar and the error alert are hidden.
 */
export function DraftNotices({ draft, lines, history }: { draft: FileDraft; lines: readonly AlertLine[]; history: boolean }) {
  return (
    <>
      {draft.conflict ? (
        <Alert variant="warning" className={STRIP}>
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>This file changed on disk since you opened it.</AlertTitle>
          <AlertAction>
            <Button variant="outline" size="xs" onClick={draft.reload}>
              Reload
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {draft.saveFailure !== null ? (
        <Alert variant="destructive" className={STRIP}>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>The file could not be saved</AlertTitle>
          <AlertDescription>{draft.saveFailure}</AlertDescription>
        </Alert>
      ) : null}
      {!history && draft.dirty ? (
        <Alert variant="info" className={STRIP}>
          <InfoIcon aria-hidden="true" />
          <AlertTitle>Unsaved changes</AlertTitle>
          <AlertAction>
            <Button variant="outline" onClick={draft.discard}>
              Discard
            </Button>
            <Button disabled={draft.saving} onClick={() => void draft.save(true)}>
              Save
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
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

/** The page's confirmations: Discard, Save with errors, Reload and leaving the page. */
export function DraftDialogs({ draft }: { draft: FileDraft }) {
  const { confirm, setConfirm } = draft
  const close = () => {
    if (confirm?.kind === "errors") confirm.answer(false)
    setConfirm(null)
  }
  return (
    <AlertDialog open={confirm !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <AlertDialogContent>
        {confirm?.kind === "discard" || confirm?.kind === "reload" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirm(null)
                  if (confirm.kind === "discard") draft.doDiscard()
                  else void draft.doReload()
                }}
              >
                {confirm.kind === "discard" ? "Discard" : "Reload"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : confirm?.kind === "errors" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{saveWithErrors(confirm.n)}</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  confirm.answer(true)
                  setConfirm(null)
                }}
              >
                Save anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : confirm?.kind === "leave" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirm(null)
                  confirm.proceed()
                }}
              >
                Discard
              </Button>
              <AlertDialogAction
                onClick={() => {
                  setConfirm(null)
                  void draft.save(false).then((ok) => {
                    if (ok) confirm.proceed()
                  })
                }}
              >
                Save
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
