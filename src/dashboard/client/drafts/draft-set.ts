import type { EditorState, Text } from "@codemirror/state"

import { failureOf, type Sent } from "@/data/api"
import { DraftStore } from "@/drafts/draft-store"
import type { CheckResult, FileError, HeaderFields } from "@/lib/files"

/** A check's answer: the lines of the text and, for a prompt, its header fields; or why the check could not run. */
export type Outcome = { ok: true; errors: FileError[]; header: HeaderFields | null } | { ok: false; error: string }

/** A file as the page loaded it, or last saved it. */
export type Loaded = { text: string; version: string }

/** A file of the route as `sync` takes it: its text, its version and, when the route checks it, its lines. */
export type SyncedFile = Loaded & { name: string; errors?: FileError[] }

/** One file's draft: its state, what was loaded, its save's outcome and, when the set checks, its check's. */
export type Draft = {
  name: string
  store: DraftStore
  loaded: Loaded
  /** The lines of the loaded text: shown again by Discard. */
  loadedResult: CheckResult
  /** A save was refused as a change on disk. */
  conflict: boolean
  /** Why the last save or reload failed, other than a conflict. */
  saveFailure: string | null
  /** The document as last saved: "Saved" shows while the draft still holds it. */
  savedDoc: Text | null
  saving: boolean
  /** Counts the states taken by Discard and Reload, after which the task rows get new ids. */
  epoch: number
  /** The last check answer applied: the text it checked and its lines. */
  result: CheckResult
  /** Why the last check could not run. */
  checkFailure: string | null
  /** A prompt's header fields from the last applied check, while the draft differs from the file. */
  details: HeaderFields | null
}

export type DraftSetOptions = {
  /** A new state of `text` for the file `name`, with an empty undo history. */
  stateOf: (name: string, text: string) => EditorState
  /** Writes the file `name` against its version `base`. */
  put: (name: string, text: string, base: string) => Promise<Sent<{ version: string }>>
  /** Checks a text of the file `name`; without it, the set checks nothing. */
  check?: (name: string, text: string) => Promise<Outcome>
  /** How long after the last edit a draft is checked, in milliseconds. */
  checkDelay?: number
}

const linesOf = (text: string, errors: FileError[] = []): CheckResult => ({ text, errors, header: null })

/**
 * The drafts of a page, one per file, each a CodeMirror state kept while the page is open. A draft is replaced only by
 * its own Save, Discard or Reload, or by a refetch while it equals its file. With `check`, a draft is checked
 * `checkDelay` ms after its last edit, and only an answer for the text it still holds is applied.
 */
export class DraftSet {
  private readonly drafts = new Map<string, Draft>()
  /** Bumped on every change, for `useSyncExternalStore`. */
  private version = 0
  private readonly listeners = new Set<() => void>()
  private readonly checkDelay: number
  /** The pending check of each draft, with the text it will check. */
  private readonly timers = new Map<string, { text: string; id: ReturnType<typeof setTimeout> }>()
  /** The checks in flight, by draft, then by text. */
  private readonly inFlight = new Map<string, Map<string, Promise<Outcome>>>()
  /** The text each draft held when `edited` last saw it. */
  private readonly seen = new Map<string, string>()

  constructor(private readonly options: DraftSetOptions) {
    this.checkDelay = options.checkDelay ?? 400
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getVersion = (): number => this.version

  private emit(): void {
    this.version += 1
    for (const l of this.listeners) l()
  }

  /**
   * Takes the route's files: a new draft for a file not held, and a refetched text, version and lines for a draft that
   * equals its file. A draft that differs from its file ignores the refetch.
   */
  sync(files: readonly SyncedFile[]): void {
    let changed = false
    for (const f of files) {
      const d = this.drafts.get(f.name)
      if (d === undefined) {
        const store = new DraftStore(this.options.stateOf(f.name, f.text))
        store.subscribe(() => this.emit())
        const lines = linesOf(f.text, f.errors)
        this.drafts.set(f.name, {
          name: f.name,
          store,
          loaded: { text: f.text, version: f.version },
          loadedResult: lines,
          conflict: false,
          saveFailure: null,
          savedDoc: null,
          saving: false,
          epoch: 0,
          result: lines,
          checkFailure: null,
          details: null,
        })
        changed = true
      } else if (!this.isDirty(f.name) && (d.loaded.text !== f.text || d.loaded.version !== f.version)) {
        const lines = linesOf(f.text, f.errors)
        d.loaded = { text: f.text, version: f.version }
        d.loadedResult = lines
        d.result = lines
        d.checkFailure = null
        d.details = null
        if (d.store.state.sliceDoc() !== f.text) d.store.replace(this.options.stateOf(f.name, f.text))
        changed = true
      }
    }
    if (changed) this.emit()
  }

  get(name: string): Draft | undefined {
    return this.drafts.get(name)
  }

  /** The names of the drafts, in the order they were added. */
  names(): string[] {
    return [...this.drafts.keys()]
  }

  /** The draft's text: `state.sliceDoc()`, the text with the file's line endings. */
  text(name: string): string | null {
    return this.drafts.get(name)?.store.state.sliceDoc() ?? null
  }

  isDirty(name: string): boolean {
    const d = this.drafts.get(name)
    return d !== undefined && d.store.state.sliceDoc() !== d.loaded.text
  }

  anyDirty(): boolean {
    return this.names().some((n) => this.isDirty(n))
  }

  /** "Saved": the draft holds the document of its last save. */
  isSaved(name: string): boolean {
    const d = this.drafts.get(name)
    return d !== undefined && d.savedDoc !== null && d.store.state.doc === d.savedDoc
  }

  /** Sets fields of a draft and tells the listeners. */
  update(name: string, patch: Partial<Pick<Draft, "conflict" | "saveFailure">>): void {
    const d = this.drafts.get(name)
    if (d === undefined) return
    Object.assign(d, patch)
    this.emit()
  }

  /** The current check of the draft holds its text, and ran. */
  private checked(d: Draft, text: string): boolean {
    return d.result.text === text && d.checkFailure === null
  }

  private clearTimer(name: string): void {
    const t = this.timers.get(name)
    if (t === undefined) return
    clearTimeout(t.id)
    this.timers.delete(name)
  }

  /**
   * Takes the draft's current text: a draft equal to its file drops the check's header fields, and a text not yet
   * checked is checked `checkDelay` ms after its last edit. The page calls it on every change of the draft.
   */
  edited(name: string): void {
    const d = this.drafts.get(name)
    if (d === undefined || this.options.check === undefined) return
    const text = d.store.state.sliceDoc()
    if (this.seen.get(name) === text) return
    this.seen.set(name, text)
    if (text === d.loaded.text && d.details !== null) {
      d.details = null
      this.emit()
    }
    this.clearTimer(name)
    if (this.checked(d, text)) return
    const id = setTimeout(() => {
      this.timers.delete(name)
      const now = this.drafts.get(name)
      if (now !== undefined && !this.checked(now, text)) void this.runCheck(name, text)
    }, this.checkDelay)
    this.timers.set(name, { text, id })
  }

  /** The check of `text` for the draft `name`: the one in flight for that text, else a new one. */
  runCheck(name: string, text: string): Promise<Outcome> {
    const check = this.options.check
    if (check === undefined) return Promise.resolve({ ok: true, errors: [], header: null })
    let running = this.inFlight.get(name)
    if (running === undefined) {
      running = new Map()
      this.inFlight.set(name, running)
    }
    const known = running.get(text)
    if (known !== undefined) return known
    const p = check(name, text).catch((e: unknown): Outcome => ({ ok: false, error: String(e) }))
    running.set(text, p)
    void p.then((outcome) => {
      running.delete(text)
      this.apply(name, text, outcome)
    })
    return p
  }

  /** Applies a check answer only while the draft still holds the text it checked. */
  private apply(name: string, checked: string, outcome: Outcome): void {
    const d = this.drafts.get(name)
    if (d === undefined || d.store.state.sliceDoc() !== checked) return
    if (!outcome.ok) d.checkFailure = outcome.error
    else {
      d.result = { text: checked, errors: outcome.errors, header: outcome.header }
      d.checkFailure = null
      d.details = checked !== d.loaded.text ? outcome.header : null
    }
    this.emit()
  }

  /**
   * Writes the draft against its loaded version, one save at a time; true once written. The loaded lines become the
   * check's for the saved text when it is known, else none.
   */
  async save(name: string): Promise<boolean> {
    const d = this.drafts.get(name)
    if (d === undefined || d.saving) return false
    const state = d.store.state
    const text = state.sliceDoc()
    d.saving = true
    d.saveFailure = null
    this.emit()
    const res = await this.options.put(name, text, d.loaded.version)
    d.saving = false
    if (res.status === 200 && res.body !== null) {
      d.loaded = { text, version: res.body.version }
      d.loadedResult = this.checked(d, text) ? d.result : linesOf(text)
      d.conflict = false
      d.savedDoc = state.doc
      if (d.store.state.sliceDoc() === text) d.details = null
      this.emit()
      return true
    }
    if (res.status === 409) d.conflict = true
    else d.saveFailure = failureOf(res)
    this.emit()
    return false
  }

  /** Puts a new state of `text` in the draft: an empty undo history, and the loaded lines shown again. */
  private reset(d: Draft, text: string): void {
    this.clearTimer(d.name)
    d.epoch += 1
    d.savedDoc = null
    d.result = d.loadedResult
    d.checkFailure = null
    d.details = null
    d.store.replace(this.options.stateOf(d.name, text))
  }

  /** Drops the draft: the loaded text again, with an empty undo history. */
  discard(name: string): void {
    const d = this.drafts.get(name)
    if (d === undefined) return
    this.reset(d, d.loaded.text)
    this.emit()
  }

  /** Takes the file as loaded again and drops its draft; the other drafts are left as they are. */
  reload(name: string, fresh: Loaded & { errors?: FileError[] }): void {
    const d = this.drafts.get(name)
    if (d === undefined) return
    d.loaded = { text: fresh.text, version: fresh.version }
    d.loadedResult = linesOf(fresh.text, fresh.errors)
    d.conflict = false
    d.saveFailure = null
    this.reset(d, fresh.text)
    this.emit()
  }

  /** Shows why a write or a reload of the file failed. */
  fail(name: string, reason: string): void {
    this.update(name, { saveFailure: reason })
  }

  /** Stops the pending checks. */
  dispose(): void {
    for (const name of [...this.timers.keys()]) this.clearTimer(name)
  }
}
