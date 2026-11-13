import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import { yaml, yamlFrontmatter } from "@codemirror/lang-yaml"
import { HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language"
import { type Diagnostic, lintGutter, setDiagnostics } from "@codemirror/lint"
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search"
import { EditorSelection, EditorState, type Extension } from "@codemirror/state"
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view"
import { tags } from "@lezer/highlight"
import { useEffect, useImperativeHandle, useRef, type Ref } from "react"

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

/** The marks of `errors` that have a line within the document: from the line's first non-blank character to its end. */
function diagnostics(state: EditorState, errors: readonly FileError[]): Diagnostic[] {
  return errors.flatMap((e) => {
    if (e.line === null || e.line < 1 || e.line > state.doc.lines) return []
    const line = state.doc.line(e.line)
    const indent = /^\s*/.exec(line.text)?.[0].length ?? 0
    return [{ from: Math.min(line.from + indent, line.to), to: line.to, severity: "error" as const, message: e.text }]
  })
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

  useImperativeHandle(
    ref,
    () => ({
      goToLine: (n: number) => {
        const v = view.current
        if (v === null || n < 1 || n > v.state.doc.lines) return
        const line = v.state.doc.line(n)
        v.dispatch({ selection: EditorSelection.cursor(line.from), effects: EditorView.scrollIntoView(line.from, { y: "center" }) })
        v.focus()
      },
    }),
    []
  )

  return <div ref={host} className="h-full min-h-0" />
}
