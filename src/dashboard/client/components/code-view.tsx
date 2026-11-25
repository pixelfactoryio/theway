import { defaultKeymap, history, historyKeymap, redo } from "@codemirror/commands"
import { markdown, markdownKeymap, pasteURLAsLink } from "@codemirror/lang-markdown"
import { yaml, yamlFrontmatter } from "@codemirror/lang-yaml"
import { HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language"
import { type Diagnostic, lintGutter, setDiagnostics } from "@codemirror/lint"
import { MergeView, unifiedMergeView } from "@codemirror/merge"
import { closeSearchPanel, highlightSelectionMatches, search, searchKeymap } from "@codemirror/search"
import {
  Compartment,
  EditorSelection,
  EditorState,
  type Extension,
  Facet,
  Prec,
  type StateCommand,
  StateEffect,
} from "@codemirror/state"
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view"
import { tags } from "@lezer/highlight"
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useSyncExternalStore, type Ref } from "react"

import { formattingKeymap } from "@/components/markdown-editor"
import { meta } from "@/data/api"
import type { DraftStore } from "@/drafts/draft-store"
import { CODE_TAG_STYLES } from "@/lib/code-languages"
import { type FileError, lineSeparatorOf } from "@/lib/files"

/** The language of a code view: a workflow's YAML, a prompt (a YAML header over Markdown), or Markdown. */
export type CodeLanguage = "yaml" | "prompt" | "markdown"

/** What a page can ask of a code view: put the cursor on a line and focus it. */
export type CodeViewHandle = { goToLine: (line: number) => void }

/** The code view's colours: fenced code's syntax colours over the whole file, and Markdown headings in bold. */
const HIGHLIGHT = HighlightStyle.define([
  ...CODE_TAG_STYLES,
  { tag: tags.heading, color: "var(--foreground)", fontWeight: "bold" },
])

/**
 * The code view's look: Geist Mono `text-xs` (14px on 20px lines at the 16px root), the mono of every ID and code block; a
 * quiet gutter (line numbers in the secondary ink, no rule, the active line's number in the ink); the active line on a
 * faint fill; selections and search matches on the blue tint; an error underlined in red with a red dot in its own
 * gutter column; the search panel (Cmd/Ctrl+F) drawn with the interface's controls: `text-sm` (15px) 28px fields and
 * buttons, `text-xs` (14px) labels, 6px corners, hairlines, its close button a drawn cross; a diagnostic at `text-xs`, as
 * the shell's tooltip.
 */
const THEME = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--background)", color: "var(--foreground)", fontSize: "var(--text-xs)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "var(--text-xs--line-height)" },
  ".cm-content": { padding: "0.75rem 0", caretColor: "var(--foreground)" },
  ".cm-line": { padding: "0 1.5rem 0 0.25rem" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)", borderLeftWidth: "1.5px" },
  ".cm-gutters": { backgroundColor: "var(--background)", color: "var(--muted-foreground)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.5rem 0 1rem", minWidth: "2.5rem" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklab, var(--accent) 60%, transparent)" },
  // Editing: the surface and its gutters on the `--muted` tint, the active line one step back, on the panel's colour.
  "&.cm-editing, &.cm-editing .cm-gutters": { backgroundColor: "var(--muted)" },
  "&.cm-editing .cm-activeLine": { backgroundColor: "var(--background)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "color-mix(in oklab, var(--ring) 28%, transparent)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in oklab, var(--ring) 16%, transparent)" },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in oklab, var(--ring) 22%, transparent)",
    outline: "1px solid color-mix(in oklab, var(--ring) 45%, transparent)",
    borderRadius: "2px",
  },
  ".cm-searchMatch-selected": { backgroundColor: "color-mix(in oklab, var(--ring) 40%, transparent)" },
  ".cm-panels": { backgroundColor: "var(--background)", color: "var(--foreground)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panel.cm-search": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 3rem 0.5rem 1rem",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-sm)",
  },
  ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": { margin: "0" },
  ".cm-panel.cm-search br": { flexBasis: "100%", height: "0" },
  ".cm-panel.cm-search .cm-textfield": {
    height: "1.75rem",
    width: "16rem",
    padding: "0 0.5rem",
    border: "1px solid var(--input)",
    borderRadius: "calc(var(--radius) - 2px)",
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-sm)",
    outline: "none",
  },
  ".cm-panel.cm-search .cm-textfield:focus-visible": {
    borderColor: "var(--ring)",
    boxShadow: "0 0 0 2px color-mix(in oklab, var(--ring) 30%, transparent)",
  },
  ".cm-panel.cm-search .cm-button": {
    height: "1.75rem",
    padding: "0 0.625rem",
    backgroundImage: "none",
    backgroundColor: "transparent",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    borderRadius: "calc(var(--radius) - 2px)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-sm)",
    cursor: "pointer",
  },
  ".cm-panel.cm-search .cm-button:hover": { backgroundColor: "var(--accent)" },
  ".cm-panel.cm-search label": {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "var(--text-xs)",
    color: "var(--muted-foreground)",
  },
  ".cm-panel.cm-search input[type=checkbox]": { margin: "0", accentColor: "var(--ring)" },
  ".cm-panel.cm-search [name=close]": {
    position: "absolute",
    top: "0.5rem",
    right: "0.75rem",
    width: "1.75rem",
    height: "1.75rem",
    borderRadius: "calc(var(--radius) - 2px)",
    fontSize: "0",
    color: "var(--muted-foreground)",
    cursor: "pointer",
  },
  ".cm-panel.cm-search [name=close]:hover": { backgroundColor: "var(--accent)", color: "var(--foreground)" },
  ".cm-panel.cm-search [name=close]::before, .cm-panel.cm-search [name=close]::after": {
    content: '""',
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "0.75rem",
    height: "1.5px",
    borderRadius: "1px",
    backgroundColor: "currentColor",
  },
  ".cm-panel.cm-search [name=close]::before": { transform: "translate(-50%, -50%) rotate(45deg)" },
  ".cm-panel.cm-search [name=close]::after": { transform: "translate(-50%, -50%) rotate(-45deg)" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--destructive)",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "4px",
  },
  ".cm-gutter-lint": { width: "1rem" },
  ".cm-gutter-lint .cm-gutterElement": {
    padding: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  // The lint gutter's error mark: a dot drawn in CSS, in place of the stock `data:` image the page's policy refuses.
  ".cm-lint-marker-error": { content: "normal", borderRadius: "50%", backgroundColor: "var(--destructive)" },
  ".cm-lint-marker": { width: "0.375rem", height: "0.375rem" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "calc(var(--radius) - 2px)",
    boxShadow: "var(--shadow-md)",
    overflow: "hidden",
  },
  ".cm-tooltip-lint, .cm-diagnostic": {
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-xs)",
    lineHeight: "var(--text-xs--line-height)",
  },
  ".cm-diagnostic": { padding: "0.375rem 0.75rem" },
  ".cm-diagnostic-error": { borderLeft: "none", color: "var(--destructive-foreground)" },
})

/** The search panel's words, capitalised as the interface writes its buttons. */
const PHRASES = EditorState.phrases.of({
  next: "Next",
  previous: "Previous",
  all: "All",
  "match case": "Match case",
  regexp: "Regexp",
  "by word": "By word",
  replace: "Replace",
  "replace all": "Replace all",
  close: "Close search",
})

/** Markdown with no keys and no URL paste of its own: they edit even a read-only state, so only the editing half has them. */
const MARKDOWN = () => markdown({ addKeymap: false, pasteURLAsLink: false })

const LANGUAGE: Record<CodeLanguage, () => Extension> = {
  yaml: () => yaml(),
  prompt: () => yamlFrontmatter({ content: MARKDOWN() }),
  markdown: MARKDOWN,
}

/** A set's two modes: what it holds while read (`reading`) and while edited (`editing`). */
export type ModeHalves = { reading: Extension; editing: Extension }

/**
 * The compartment of a draft's mode, in the live Markdown set and in the code set: the reading half or the editing
 * half of the set. `history()` stays outside it, so a switch keeps the text, the selection and the undo history.
 */
export const editMode = new Compartment()

/** The halves of the set a state holds, given outside the compartment, so a switch finds the other half. */
const HALVES = Facet.define<ModeHalves, ModeHalves | null>({ combine: (values) => values[0] ?? null })

/** Marks a state in its editing half. */
const EDITING = Facet.define<boolean, boolean>({ combine: (values) => values.some((v) => v) })

/** The editing half's own content: its mark and the editor's `cm-editing` class, which the themes tint. */
const editingContent = (halves: ModeHalves): Extension => [
  EDITING.of(true),
  EditorView.editorAttributes.of({ class: "cm-editing" }),
  halves.editing,
]

/** A set's mode: its halves, and the compartment holding the one of `editing`. */
export function modeExtensions(halves: ModeHalves, editing: boolean): Extension[] {
  return [HALVES.of(halves), editMode.of(editing ? editingContent(halves) : halves.reading)]
}

/** Whether `state` holds its set's editing half. */
export const isEditing = (state: EditorState): boolean => state.facet(EDITING)

/**
 * The effects that give a state the set `set` of halves `halves` in the mode `editing`. A whole reconfigure keeps a
 * compartment's last content, which would be the other set's half: the compartment is reconfigured with it, first, so
 * the state copies its compartments before changing one.
 */
export const setEffects = (set: Extension[], halves: ModeHalves, editing: boolean): StateEffect<unknown>[] => [
  editMode.reconfigure(editing ? editingContent(halves) : halves.reading),
  StateEffect.reconfigure.of(set),
]

/** The effect that puts `state` in the mode `editing`; `null` when it is in it, or holds no mode. */
export function modeEffect(state: EditorState, editing: boolean): StateEffect<unknown> | null {
  const halves = state.facet(HALVES)
  if (halves === null || isEditing(state) === editing) return null
  return editMode.reconfigure(editing ? editingContent(halves) : halves.reading)
}

/**
 * Puts the store's state in the page's mode. A mounted view's open search panel closes first: it builds its Replace
 * fields once, for the mode it opened in.
 */
export function applyMode(store: DraftStore, editing: boolean): void {
  const effect = modeEffect(store.state, editing)
  if (effect === null) return
  if (store.view !== null) closeSearchPanel(store.view)
  store.dispatch({ effects: effect })
}

/**
 * Runs a history command (`undo`, `redo`) on the store's draft whatever its mode: the commands refuse a read-only
 * state, so the state is switched to editing, the command run, and the state switched back, in three dispatches.
 */
export function runEditing(store: DraftStore, command: StateCommand): boolean {
  const on = modeEffect(store.state, true)
  if (on !== null) store.dispatch({ effects: on })
  const done = command({ state: store.state, dispatch: store.dispatch })
  if (on !== null) {
    const off = modeEffect(store.state, false)
    if (off !== null) store.dispatch({ effects: off })
  }
  return done
}

/** Marks a state that holds the code set. */
const CODE = Facet.define<boolean, boolean>({ combine: (values) => values.length > 0 })

/** Whether `state` holds the code set. */
export const isCode = (state: EditorState): boolean => state.facet(CODE)

/** Each language's halves, made once. */
const HALVES_OF = new Map<CodeLanguage, ModeHalves>()

/** The stock keys of a code view: the default keys, history and search. */
const STOCK_KEYS = () => keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap])

/**
 * The code set's halves. Reading: read-only (CodeMirror sets `aria-readonly`), caret movement and search, whose panel
 * then has no Replace. Editing: the stock keys with history and `Mod-Shift-z` as redo on every platform; a Markdown or
 * prompt source also takes the formatting keys, Markdown's own keys and its URL paste.
 */
function codeHalves(language: CodeLanguage): ModeHalves {
  const made = HALVES_OF.get(language)
  if (made !== undefined) return made
  const prose = language !== "yaml"
  const halves: ModeHalves = {
    reading: [EditorState.readOnly.of(true), keymap.of([...defaultKeymap, ...searchKeymap])],
    editing: [
      ...(prose ? [formattingKeymap, Prec.high(keymap.of(markdownKeymap)), pasteURLAsLink] : []),
      STOCK_KEYS(),
      keymap.of([{ key: "Mod-Shift-z", run: redo, preventDefault: true }]),
    ],
  }
  HALVES_OF.set(language, halves)
  return halves
}

/**
 * The extension set every code view of the dashboard holds, built by hand (no setup bundle): line numbers, the active line,
 * selection, indentation on input, history, search at the top, the language, the highlight style, the theme, wrapped
 * lines, the lint gutter, the accessible name, the file's line separator and the style nonce. The keys are each view's.
 */
function sharedExtensions({
  language,
  name,
  separator,
}: {
  language: CodeLanguage
  name: string
  separator: string
}): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    indentOnInput(),
    history(),
    search({ top: true }),
    highlightSelectionMatches(),
    LANGUAGE[language](),
    syntaxHighlighting(HIGHLIGHT),
    THEME,
    PHRASES,
    EditorView.lineWrapping,
    lintGutter(),
    EditorView.contentAttributes.of({ "aria-label": name }),
    EditorState.lineSeparator.of(separator),
    EditorView.cspNonce.of(meta("nonce")),
  ]
}

/**
 * The code set of a draft: the shared set (with `history()`) and the mode compartment (`codeHalves`), in its reading
 * half unless `editing`.
 */
export function codeExtensions({
  language,
  name,
  separator,
  editing = false,
}: {
  language: CodeLanguage
  name: string
  separator: string
  editing?: boolean
}): Extension[] {
  return [
    CODE.of(true),
    ...sharedExtensions({ language, name, separator }),
    ...modeExtensions(codeHalves(language), editing),
  ]
}

/**
 * The effects that give `state` the code set of `language`, keeping its text, selection, undo history, line separator
 * and mode: the mirror of the live set's `toLive`.
 */
export function toCode(state: EditorState, language: CodeLanguage, name: string): StateEffect<unknown>[] {
  const editing = isEditing(state)
  return setEffects(
    codeExtensions({ language, name, separator: state.lineBreak, editing }),
    codeHalves(language),
    editing,
  )
}

/**
 * A draft's first state: `text` with the code set in its reading half (a page opens reading) and its line separator,
 * so that the draft equals the file.
 */
export function draftState(text: string, language: CodeLanguage, name: string): EditorState {
  return EditorState.create({
    doc: text,
    extensions: codeExtensions({ language, name, separator: lineSeparatorOf(text) }),
  })
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
  view.dispatch({
    selection: EditorSelection.cursor(line.from),
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  })
  view.focus()
}

/**
 * The code view of a draft, in the page's mode (`editing`): it mounts the draft's state, dispatches through it, and
 * marks each of `errors` (the applied check's) that has a line; it creates no state and runs no check. A state that
 * holds the live Markdown set (a Markdown file's Source) takes the code set of `source` first (`toCode`).
 */
export function EditableCodeView({
  draft,
  errors,
  editing,
  source,
  ref,
}: {
  draft: DraftStore
  errors: readonly FileError[]
  /** The page's mode, applied on mount, on every change and on every new state of the draft. */
  editing: boolean
  /** The language and accessible name of a draft whose state may hold another set. */
  source?: { language: CodeLanguage; name: string }
  ref?: Ref<CodeViewHandle>
}) {
  const host = useRef<HTMLDivElement>(null)
  const latestSource = useRef(source)
  useLayoutEffect(() => {
    latestSource.current = source
  })

  useEffect(() => {
    if (host.current === null) return
    const src = latestSource.current
    const v = new EditorView({
      state:
        isCode(draft.state) || src === undefined
          ? draft.state
          : draft.state.update({ effects: toCode(draft.state, src.language, src.name) }).state,
      parent: host.current,
      dispatchTransactions: (trs, view) => {
        view.update(trs)
        draft.set(view.state)
      },
    })
    draft.attach(v)
    if (v.state !== draft.state) draft.set(v.state)
    return () => {
      draft.detach(v)
      v.destroy()
    }
  }, [draft])

  // Again for a new state (Discard, Reload, Restore), which holds no marks and, for a Markdown file, not the code set.
  useSyncExternalStore(draft.subscribe, draft.getState)
  const generation = draft.generation
  useEffect(() => {
    const src = latestSource.current
    if (!isCode(draft.state) && src !== undefined)
      draft.dispatch({ effects: toCode(draft.state, src.language, src.name) })
  }, [draft, generation])
  useEffect(() => {
    draft.dispatch(setDiagnostics(draft.state, diagnostics(draft.state, errors)))
  }, [draft, errors, generation])
  useEffect(() => applyMode(draft, editing), [draft, editing, generation])

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
      extensions: [
        ...sharedExtensions({ language, name, separator: lineSeparatorOf(text) }),
        STOCK_KEYS(),
        EditorState.readOnly.of(true),
      ],
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
const tint = (token: string, percent: number): string =>
  `color-mix(in oklab, var(--${token}) ${percent}%, transparent) !important`

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
  STOCK_KEYS(),
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

  return (
    <div
      ref={host}
      className="h-full min-h-0 [&_.cm-mergeView]:h-full [&_.cm-mergeView]:overflow-y-auto [&_.cm-mergeViewEditor+.cm-mergeViewEditor]:border-l"
    />
  )
}
