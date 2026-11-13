import { defaultKeymap, history, historyKeymap, redo } from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import { yaml, yamlFrontmatter } from "@codemirror/lang-yaml"
import { HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language"
import { type Diagnostic, lintGutter, setDiagnostics } from "@codemirror/lint"
import { MergeView, unifiedMergeView } from "@codemirror/merge"
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search"
import { EditorSelection, EditorState, type Extension, type TransactionSpec } from "@codemirror/state"
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view"
import { tags } from "@lezer/highlight"
import { useEffect, useImperativeHandle, useRef, useSyncExternalStore, type Ref } from "react"

import { type FileError, lineSeparatorOf } from "@/lib/files"

/** The language of a code view: a workflow's YAML, a prompt (a YAML header over Markdown), or Markdown. */
export type CodeLanguage = "yaml" | "prompt" | "markdown"

/** What a page can ask of a code view: put the cursor on a line and focus it. */
export type CodeViewHandle = { goToLine: (line: number) => void }

/** The style nonce of this page's response, which CodeMirror puts on the `<style>` tags it injects. */
const nonce = (): string => document.querySelector<HTMLMetaElement>('meta[name="theway-nonce"]')?.content ?? ""

const HIGHLIGHT = HighlightStyle.define([
  { tag: [tags.keyword, tags.meta], color: "var(--code-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--code-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.url, tags.link], color: "var(--code-constant)" },
  {
    tag: [tags.propertyName, tags.definition(tags.propertyName), tags.tagName, tags.typeName, tags.labelName],
    color: "var(--code-property)",
  },
  { tag: [tags.comment, tags.lineComment], color: "var(--code-comment)" },
  { tag: tags.heading, color: "var(--foreground)", fontWeight: "bold" },
])

const THEME = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--background)", color: "var(--foreground)", fontSize: "0.875rem" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.5rem" },
  ".cm-content": { padding: "0.5rem 0", caretColor: "var(--foreground)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.75rem 0 1rem" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklab, var(--muted) 70%, transparent)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "color-mix(in oklab, var(--ring) 35%, transparent)" },
  ".cm-selectionMatch, .cm-searchMatch": { backgroundColor: "color-mix(in oklab, var(--ring) 30%, transparent)" },
  ".cm-searchMatch-selected": { backgroundColor: "color-mix(in oklab, var(--ring) 30%, transparent)" },
  ".cm-panels": { backgroundColor: "var(--background)", color: "var(--foreground)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panel.cm-search input, .cm-panel.cm-search .cm-textfield": {
    border: "1px solid var(--input)",
    borderRadius: "var(--radius)",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
  },
  ".cm-panel.cm-search button, .cm-panel.cm-search .cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--secondary)",
    color: "var(--secondary-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
  },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--destructive)",
    textUnderlineOffset: "3px",
  },
  ".cm-tooltip": { backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" },
  ".cm-tooltip-lint, .cm-diagnostic": { fontFamily: "var(--font-sans)" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--destructive)" },
})

const LANGUAGE: Record<CodeLanguage, () => Extension> = {
  yaml: () => yaml(),
  prompt: () => yamlFrontmatter({ content: markdown() }),
  markdown: () => markdown(),
}

/**
 * The extension set every code view of the dashboard holds, built by hand (no setup bundle): line numbers, the active line,
 * selection, indentation on input, history, search at the top, the keymaps, the language, the highlight style, the
 * theme, wrapped lines, the lint gutter, the accessible name, the file's line separator and the style nonce.
 */
export function sharedExtensions({ language, name, separator }: { language: CodeLanguage; name: string; separator: string }): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    indentOnInput(),
    history(),
    search({ top: true }),
    highlightSelectionMatches(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    LANGUAGE[language](),
    syntaxHighlighting(HIGHLIGHT),
    THEME,
    EditorView.lineWrapping,
    lintGutter(),
    EditorView.contentAttributes.of({ "aria-label": name }),
    EditorState.lineSeparator.of(separator),
    EditorView.cspNonce.of(nonce()),
  ]
}

/**
 * The extension set of an editable code view: the shared set (with `history()` and its keymap) and `Mod-Shift-z` as redo
 * on every platform, beside the stock keys.
 */
export function editableExtensions(options: { language: CodeLanguage; name: string; separator: string }): Extension[] {
  return [...sharedExtensions(options), keymap.of([{ key: "Mod-Shift-z", run: redo, preventDefault: true }])]
}

/** A draft's first state: `text` with the editable set and its line separator, so that the draft equals the file. */
export function draftState(text: string, language: CodeLanguage, name: string): EditorState {
  return EditorState.create({ doc: text, extensions: editableExtensions({ language, name, separator: lineSeparatorOf(text) }) })
}

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

  /** The one dispatch function: through the mounted view, else on the state. */
  dispatch = (...specs: TransactionSpec[]): void => {
    if (this.view !== null) this.view.dispatch(...specs)
    else this.set(this.state.update(...specs).state)
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

/** The marks of `errors` that have a line within the document: from the line's first non-blank character to its end. */
function diagnostics(state: EditorState, errors: readonly FileError[]): Diagnostic[] {
  return errors.flatMap((e) => {
    if (e.line === null || e.line < 1 || e.line > state.doc.lines) return []
    const line = state.doc.line(e.line)
    const indent = /^\s*/.exec(line.text)?.[0].length ?? 0
    return [{ from: Math.min(line.from + indent, line.to), to: line.to, severity: "error" as const, message: e.text }]
  })
}

/** Puts the cursor of `view` on line `n` and focuses it. */
function goTo(view: EditorView | null, n: number): void {
  if (view === null || n < 1 || n > view.state.doc.lines) return
  const line = view.state.doc.line(n)
  view.dispatch({ selection: EditorSelection.cursor(line.from), effects: EditorView.scrollIntoView(line.from, { y: "center" }) })
  view.focus()
}

/**
 * The editable code view of a draft: it mounts the draft's state unchanged, dispatches through it, and marks each of
 * `errors` (the applied check's) that has a line; it creates no state and runs no check.
 */
export function EditableCodeView({ draft, errors, ref }: { draft: DraftStore; errors: readonly FileError[]; ref?: Ref<CodeViewHandle> }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (host.current === null) return
    const v = new EditorView({
      state: draft.state,
      parent: host.current,
      dispatchTransactions: (trs, view) => {
        view.update(trs)
        draft.set(view.state)
      },
    })
    draft.view = v
    return () => {
      if (draft.view === v) draft.view = null
      v.destroy()
    }
  }, [draft])

  // Again for a new state (Discard, Reload, Restore), which holds no marks.
  useSyncExternalStore(draft.subscribe, draft.getState)
  const generation = draft.generation
  useEffect(() => {
    draft.dispatch(setDiagnostics(draft.state, diagnostics(draft.state, errors)))
  }, [draft, errors, generation])

  useImperativeHandle(ref, () => ({ goToLine: (n: number) => goTo(draft.view, n) }), [draft])

  return <div ref={host} className="h-full min-h-0" />
}

/**
 * A read-only code view of a file's text: it keeps focus, a caret and search, and marks each of `errors` that has a
 * line; it runs no check. `name` is its accessible name.
 */
export function CodeView({
  text,
  language,
  name,
  errors,
  ref,
}: {
  text: string
  language: CodeLanguage
  name: string
  errors: readonly FileError[]
  ref?: Ref<CodeViewHandle>
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)

  useEffect(() => {
    if (host.current === null) return
    const state = EditorState.create({
      doc: text,
      extensions: [...sharedExtensions({ language, name, separator: lineSeparatorOf(text) }), EditorState.readOnly.of(true)],
    })
    const v = new EditorView({ state, parent: host.current })
    v.dispatch(setDiagnostics(v.state, diagnostics(v.state, errors)))
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
  }, [text, language, name, errors])

  useImperativeHandle(ref, () => ({ goToLine: (n: number) => goTo(view.current, n) }), [])

  return <div ref={host} className="h-full min-h-0" />
}

/** A tint of a colour token for a difference: `color-mix` of the token at `percent`. */
const tint = (token: string, percent: number): string => `color-mix(in oklab, var(--${token}) ${percent}%, transparent) !important`

/**
 * The colours of a difference. Unified: changed lines `success` at 10%, inserted text `success` at 18%, deleted
 * chunks `destructive` at 10% and deleted text `destructive` at 18%. Split: the version's changes `destructive` at 12%,
 * the saved file's `success` at 12%. A collapsed stretch on `muted` with `muted-foreground` text.
 */
const DIFF_THEME = EditorView.theme({
  "&.cm-merge-b .cm-changedLine, & .cm-inlineChangedLine": { backgroundColor: tint("success", 10) },
  "&.cm-merge-b .cm-changedText": { background: tint("success", 18) },
  "& .cm-deletedChunk": { backgroundColor: tint("destructive", 10) },
  "& .cm-deletedChunk .cm-deletedText, & .cm-deletedLine": { background: tint("destructive", 18) },
  "& .cm-deletedChunk del": { textDecoration: "none" },
  "&.cm-merge-b .cm-changedLineGutter, & .cm-inlineChangedLineGutter": { background: "var(--success) !important" },
  "&.cm-merge-a .cm-changedLineGutter, & .cm-deletedLineGutter": { background: "var(--destructive) !important" },
  "& .cm-collapsedLines": {
    background: "var(--muted) !important",
    color: "var(--muted-foreground) !important",
    fontFamily: "var(--font-mono)",
  },
})

/** The split view's colours: each side's changes at 12%. */
const SPLIT_THEME = EditorView.theme({
  "&.cm-merge-a .cm-changedLine": { backgroundColor: tint("destructive", 12) },
  "&.cm-merge-a .cm-changedText": { background: tint("destructive", 12) },
  "&.cm-merge-b .cm-changedLine": { backgroundColor: tint("success", 12) },
  "&.cm-merge-b .cm-changedText": { background: tint("success", 12) },
})

/** Unchanged stretches of 4 lines or more collapse, keeping 3 lines each side. */
const COLLAPSE = { margin: 3, minSize: 4 }

/** A read-only extension set: the code view's shared set (its nonce included) with `name` and `text`'s separator. */
const readOnlySet = (text: string, language: CodeLanguage, name: string): Extension[] => [
  ...sharedExtensions({ language, name, separator: lineSeparatorOf(text) }),
  EditorState.readOnly.of(true),
  DIFF_THEME,
]

/**
 * The difference from `original` (a version) to `text` (the file as saved), read-only: one editor with the deleted
 * chunks inline (`unified`), or the two side by side, the version at the left (`split`).
 */
export function DiffView({
  original,
  text,
  layout,
  language,
  names,
}: {
  original: string
  text: string
  layout: "unified" | "split"
  language: CodeLanguage
  names: { original: string; text: string }
}) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (host.current === null) return
    if (layout === "unified") {
      const v = new EditorView({
        state: EditorState.create({
          doc: text,
          extensions: [
            ...readOnlySet(text, language, names.text),
            unifiedMergeView({ original, mergeControls: false, collapseUnchanged: COLLAPSE }),
          ],
        }),
        parent: host.current,
      })
      return () => v.destroy()
    }
    const m = new MergeView({
      a: { doc: original, extensions: [...readOnlySet(original, language, names.original), SPLIT_THEME] },
      b: { doc: text, extensions: [...readOnlySet(text, language, names.text), SPLIT_THEME] },
      parent: host.current,
      collapseUnchanged: COLLAPSE,
    })
    return () => m.destroy()
  }, [original, text, layout, language, names.original, names.text])

  return <div ref={host} className="h-full min-h-0 [&_.cm-mergeView]:h-full [&_.cm-mergeView]:overflow-y-auto [&_.cm-mergeViewEditor+.cm-mergeViewEditor]:border-l" />
}
