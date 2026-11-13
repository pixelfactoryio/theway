import { EditorState, type Extension, type Text } from "@codemirror/state"

import { type CodeLanguage, DraftStore, editableExtensions } from "@/components/code-view"
import { lineSeparatorOf } from "@/lib/files"
import { sendJson } from "@/shell/api"

/** One file of a change as the page loaded it, or last saved it. */
export type Loaded = { text: string; version: string }

/** One file's draft on a change page: its state, what was loaded, and its save's outcome. */
export type FileDraft = {
  name: string
  store: DraftStore
  loaded: Loaded
  /** A save was refused as a change on disk. */
  conflict: boolean
  /** Why the last save failed, other than a conflict. */
  saveFailure: string | null
  /** The document as last saved: "Saved" shows while the draft still holds it. */
  savedDoc: Text | null
  saving: boolean
  /** Counts the states taken by Discard and Reload, after which the task rows get new ids. */
  epoch: number
}

/** A file's language: YAML for `change.yaml`, Markdown for the others. */
const languageOf = (name: string): CodeLanguage => (name === "change.yaml" ? "yaml" : "markdown")

/**
 * The drafts of a change page, one per file (`change.yaml` and each Markdown file), each a CodeMirror state kept across
 * tab switches. A draft is replaced only by its own Save, Discard or Reload, or by a refetch while it equals its file.
 */
export class ChangeDrafts {
  readonly drafts = new Map<string, FileDraft>()
  /** Bumped on every change, for `useSyncExternalStore`. */
  version = 0
  private readonly listeners = new Set<() => void>()

  constructor(
    /** `/api/projects/<key>/changes/<id>`. */
    private readonly api: string,
    /** The extensions a file's state holds beside the editable set: the Markdown formatting keys. */
    private readonly extra: (name: string) => Extension[]
  ) {}

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getVersion = (): number => this.version

  private emit(): void {
    this.version += 1
    for (const l of this.listeners) l()
  }

  /** A new state of `text` for the file `name`, with an empty undo history and the file's line separator. */
  stateOf(name: string, text: string): EditorState {
    return EditorState.create({
      doc: text,
      extensions: [...editableExtensions({ language: languageOf(name), name, separator: lineSeparatorOf(text) }), ...this.extra(name)],
    })
  }

  /** Takes the route's files: a new draft for a file not held, and a refetched text for a draft that equals its file. */
  sync(files: readonly ({ name: string } & Loaded)[]): void {
    let changed = false
    for (const f of files) {
      const d = this.drafts.get(f.name)
      if (d === undefined) {
        const store = new DraftStore(this.stateOf(f.name, f.text))
        store.subscribe(() => this.emit())
        this.drafts.set(f.name, {
          name: f.name,
          store,
          loaded: { text: f.text, version: f.version },
          conflict: false,
          saveFailure: null,
          savedDoc: null,
          saving: false,
          epoch: 0,
        })
        changed = true
      } else if (!this.isDirty(f.name) && (d.loaded.text !== f.text || d.loaded.version !== f.version)) {
        d.loaded = { text: f.text, version: f.version }
        if (d.store.state.sliceDoc() !== f.text) d.store.replace(this.stateOf(f.name, f.text))
        changed = true
      }
    }
    if (changed) this.emit()
  }

  get(name: string): FileDraft | undefined {
    return this.drafts.get(name)
  }

  /** The draft's text: `state.sliceDoc()`, the text with the file's line endings. */
  text(name: string): string | null {
    return this.drafts.get(name)?.store.state.sliceDoc() ?? null
  }

  isDirty(name: string): boolean {
    const d = this.drafts.get(name)
    return d !== undefined && d.store.state.sliceDoc() !== d.loaded.text
  }

  /** "Saved": the draft holds the document of its last save. */
  isSaved(name: string): boolean {
    const d = this.drafts.get(name)
    return d !== undefined && d.savedDoc !== null && d.store.state.doc === d.savedDoc
  }

  private update(name: string, patch: Partial<FileDraft>): void {
    const d = this.drafts.get(name)
    if (d === undefined) return
    Object.assign(d, patch)
    this.emit()
  }

  /** Writes the draft against its loaded version, one save at a time; true once written. */
  async save(name: string): Promise<boolean> {
    const d = this.drafts.get(name)
    if (d === undefined || d.saving) return false
    const state = d.store.state
    const text = state.sliceDoc()
    this.update(name, { saving: true, saveFailure: null })
    const res = await sendJson("PUT", `${this.api}/files/${encodeURIComponent(name)}`, { text, base: d.loaded.version })
    if (res.status === 200 && typeof res.body.version === "string") {
      this.update(name, { saving: false, loaded: { text, version: res.body.version }, conflict: false, savedDoc: state.doc })
      return true
    }
    if (res.status === 409) this.update(name, { saving: false, conflict: true })
    else this.update(name, { saving: false, saveFailure: res.error !== "" ? res.error : `${res.status}` })
    return false
  }

  /** Drops the draft: the loaded text again, with an empty undo history. */
  discard(name: string): void {
    const d = this.drafts.get(name)
    if (d === undefined) return
    d.epoch += 1
    d.savedDoc = null
    d.store.replace(this.stateOf(name, d.loaded.text))
    this.emit()
  }

  /** Shows why a write or a reload of the file failed. */
  fail(name: string, reason: string): void {
    this.update(name, { saveFailure: reason })
  }

  /** Loads the file again and drops its draft; the other files are left as they are. */
  reload(name: string, fresh: Loaded): void {
    const d = this.drafts.get(name)
    if (d === undefined) return
    d.loaded = fresh
    d.conflict = false
    d.saveFailure = null
    d.epoch += 1
    d.savedDoc = null
    d.store.replace(this.stateOf(name, fresh.text))
    this.emit()
  }
}
