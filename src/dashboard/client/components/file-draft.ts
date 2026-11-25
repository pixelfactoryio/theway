import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"

import { type CodeLanguage, draftState } from "@/components/code-view"
import { failureOf, getJson } from "@/data/api"
import { apiPath, queryKeys, useWrites } from "@/data/queries"
import type { DraftSet, Outcome } from "@/drafts/draft-set"
import { useDrafts } from "@/drafts/use-drafts"
import { type FileBody, FileBodySchema, type FileError, headerOf } from "@/lib/files"
import { leavesFile } from "@/lib/routes"

/** No lines: one array, so a view that marks the lines marks them once. */
const NO_LINES: FileError[] = []

/** The number of errors of `text`: the applied check's when it holds that text, else a new check's (0 when it fails). */
async function errorsOf(set: DraftSet, name: string, text: string): Promise<number> {
  const d = set.get(name)
  if (d !== undefined && d.result.text === text && d.checkFailure === null) return d.result.errors.length
  const outcome = await set.runCheck(name, text)
  return outcome.ok ? outcome.errors.length : 0
}

/**
 * A file page's draft: created when the page loads the file, then following a refetch while it equals the file. It
 * checks the draft 400ms after the last edit, saves it, discards it, reloads the file, restores a version, and guards
 * leaving the page while the draft differs from the file.
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
  const writes = useWrites()
  const path = apiPath.file(kind, project, name)
  // The file's route, once no refetch runs.
  const files = useMemo(
    () =>
      file === undefined || fetching ? [] : [{ name, text: file.text, version: file.version, errors: file.errors }],
    [file, fetching, name],
  )
  const drafts = useDrafts({
    files,
    stateOf: (_, text) => draftState(text, language, docName),
    put: (_, text, base) => writes.saveFile(kind, project, name, text, base),
    check: async (_, text): Promise<Outcome> => {
      const r = await writes.checkFile(kind, project, name, text)
      return r.status === 200 && r.body !== null
        ? { ok: true, errors: r.body.errors, header: kind === "prompts" ? headerOf(r.body) : null }
        : { ok: false, error: failureOf(r) }
    },
    refetch: async () => {
      let fresh: FileBody
      try {
        fresh = await getJson(path, FileBodySchema)
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
      queryClient.setQueryData(queryKeys.file(path), fresh)
      return { text: fresh.text, version: fresh.version, errors: fresh.errors }
    },
    errorCount: (n, text) => errorsOf(drafts.set, n, text),
    leaves: (target) => leavesFile({ fileKind: kind, project, name }, target),
    order: [name],
  })
  const { set, save, discard, doDiscard, reload, doReload } = drafts
  const d = set.get(name)
  // A draft's text is always read with the state's line break: `sliceDoc()`.
  const text = set.text(name)

  /** Writes the version `id` as the file, then reloads it; true once written. */
  const restore = useCallback(
    async (id: string): Promise<boolean> => {
      const loaded = set.get(name)?.loaded
      if (loaded === undefined) return false
      set.update(name, { saveFailure: null })
      const res = await writes.restoreFile(kind, project, name, id, loaded.version)
      if (res.status === 200 && res.body !== null) {
        await doReload(name)
        return true
      }
      if (res.status === 409) set.update(name, { conflict: true })
      else set.fail(name, failureOf(res))
      return false
    },
    [set, writes, kind, project, name, doReload],
  )

  return {
    store: d?.store ?? null,
    loaded: d?.loaded ?? null,
    text,
    dirty: set.isDirty(name),
    /** The lines shown: none after a failed check. */
    errors: d === undefined || d.checkFailure !== null ? NO_LINES : d.result.errors,
    checkFailure: d?.checkFailure ?? null,
    conflict: d?.conflict ?? false,
    saveFailure: d?.saveFailure ?? null,
    details: d?.details ?? null,
    saved: set.isSaved(name),
    confirm: drafts.confirm,
    setConfirm: drafts.setConfirm,
    /** A save is running. */
    saving: d?.saving ?? false,
    save: (ask: boolean) => save(name, ask),
    discard: () => discard(name),
    doDiscard: () => doDiscard(name),
    reload: () => reload(name),
    doReload: () => doReload(name),
    restore,
  }
}

export type FileDraft = ReturnType<typeof useFileDraft>
