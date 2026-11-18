import { type EditorState, Transaction, type TransactionSpec } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"

/**
 * A file page's draft: one CodeMirror state and one dispatch function. A mounted editable view shows that state and
 * its transactions update it; with no view mounted, `dispatch` applies them to the state alone.
 */
export class DraftStore {
  state: EditorState
  view: EditorView | null = null
  /** Counts the states taken by `replace`. */
  generation = 0
  private readonly listeners = new Set<() => void>()

  constructor(state: EditorState) {
    this.state = state
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getState = (): EditorState => this.state

  /**
   * The one dispatch function: through the mounted view, else on the state. It takes transaction specs, or a
   * transaction made from the current state (as `undo` and `redo` of `@codemirror/commands` give it).
   */
  dispatch = (...specs: (TransactionSpec | Transaction)[]): void => {
    const [first] = specs
    if (first instanceof Transaction) {
      if (this.view !== null) this.view.dispatch(first)
      else this.set(first.state)
      return
    }
    if (this.view !== null) this.view.dispatch(...(specs as TransactionSpec[]))
    else this.set(this.state.update(...(specs as TransactionSpec[])).state)
  }

  /** Makes `v` the mounted view the store dispatches through. */
  attach(v: EditorView): void {
    this.view = v
  }

  /** Forgets `v` when it is still the mounted view. */
  detach(v: EditorView): void {
    if (this.view === v) this.view = null
  }

  /** Takes a new state (Discard, Reload, Restore): an empty undo history. */
  replace(state: EditorState): void {
    this.generation += 1
    this.view?.setState(state)
    this.set(state)
  }

  set(state: EditorState): void {
    this.state = state
    for (const l of this.listeners) l()
  }
}
