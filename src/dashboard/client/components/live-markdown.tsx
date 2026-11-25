import { defaultKeymap, history, historyKeymap, redo } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { ensureSyntaxTree, syntaxHighlighting, syntaxTree } from "@codemirror/language"
import { EditorState, type Extension, Facet, type Range, StateEffect, StateField } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { highlightTree } from "@lezer/highlight"
import { cn } from "cn"
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react"

import { CODE_COPY_EVENT, useCodeCopy } from "@/components/copy"
import { OutlinedDoc } from "@/components/doc-outline"
import { formattingKeymap } from "@/components/markdown-editor"
import { meta } from "@/data/api"
import type { DraftStore } from "@/drafts/draft-store"
import { inlineCode, isLinkTarget } from "@/lib/changes"
import { CODE_BLOCK_STYLES, CODE_LANGUAGES } from "@/lib/code-languages"
import {
  activeLines,
  type CodeBlock,
  codeBlocks,
  decorationPlan,
  frontMatter,
  type LineKind,
  type MarkKind,
  outlineOf,
  softBreaks as softBreakSpans,
  type TableBlock,
  tableBlocks,
  taskToggle,
  titleLine,
  type Widget,
} from "@/lib/live-preview"

const MUTED = { color: "var(--muted-foreground)" }
/** Geist Mono a step under the text it sits in (13.8px in the 17px body text), never under 12px. */
const MONO = { fontFamily: "var(--font-mono)", fontSize: "max(0.75rem, 0.8125em)" }
/**
 * Inline code: the mono step, in the text's colour, on a faint tint that keeps inside its line (no vertical padding,
 * 2px at its sides so it stays close to the punctuation around it), so a sentence full of paths still reads as a
 * sentence. A token that wraps (one longer than `WHOLE_CODE`) keeps its tint and sides on each of its lines.
 */
const INLINE_CODE = {
  ...MONO,
  padding: "0 2px",
  borderRadius: "var(--radius-sm)",
  backgroundColor: "var(--doc-code-tint)",
  boxDecorationBreak: "clone",
  WebkitBoxDecorationBreak: "clone",
}

/** The longest inline code (its backticks included) kept whole on one line: about a third of the reading measure. */
const WHOLE_CODE = 32

/** The widget buffers on each side of inline code's hidden backticks (an empty widget), and those right beside it. */
const CODE_BUFFERS = [
  ".cm-widgetBuffer:has(+ .cm-lp-inline-code)",
  ".cm-widgetBuffer:has(+ span:empty + .cm-widgetBuffer + .cm-lp-inline-code)",
  ".cm-lp-inline-code + .cm-widgetBuffer",
  ".cm-lp-inline-code + .cm-widgetBuffer + span:empty + .cm-widgetBuffer",
].join(", ")
/** A heading of the document's scale: 600, its size and line height from the `--text-doc-*` tokens. */
const HEADING = (level: string, space: string) => ({
  fontSize: `var(--text-doc-${level})`,
  lineHeight: `var(--text-doc-${level}--line-height)`,
  fontWeight: "600",
  paddingTop: space,
})

/** How far a wrapped code line continues past its start. */
const CODE_HANG = "2ch"

/** The deepest list level indented; deeper items line up with it. */
const MAX_DEPTH = 6

/** A list level's indent: room for its marker, one per level. */
const INDENT = 1.5

/** Each list level's indent: a marker's line hangs its marker, a later line starts at the text. */
const ITEM_STYLES = Object.fromEntries(
  Array.from({ length: MAX_DEPTH }, (_, i) => [
    [`.cm-lp-item-${i + 1}`, { paddingLeft: `${(i + 1) * INDENT}em` }],
    [`.cm-lp-item-${i + 1}.cm-lp-item-first`, { textIndent: `-${INDENT}em` }],
  ]).flat(),
)

/** The rule over an h2, 12px into the space above it, as wide as the text: a section's start. */
const SECTION_RULE = {
  backgroundImage: "linear-gradient(var(--border), var(--border))",
  backgroundRepeat: "no-repeat",
  backgroundSize: "100% 1px",
  backgroundPosition: "0 0.75rem",
}

/** No rule and no space over a heading: the document's first line, or the first under a hidden title. */
const FIRST_HEADING = { paddingTop: "0", backgroundImage: "none" }

/**
 * The document's scale and rhythm: body 17/24 (`text-doc`) in the document's colour, about 65 characters a line; a blank line
 * between two blocks 8px tall. A heading has more room above it than under it (with the blank line before it, 40px
 * above h1, 44px above h2 with its rule, 32px above h3, 8px under each), so it reads with the text it opens; 8px from
 * one list item to the next.
 */
const THEME = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--background)", color: "var(--doc-foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-doc)",
    lineHeight: "var(--text-doc--line-height)",
    overflow: "auto",
  },
  // The column's 16px gutters, the panel's; each line on its left edge, at most `--read-width` wide, code blocks and tables too (a
  // table fits its columns, and one wider than the measure scrolls in its own box).
  // `minWidth: 0` keeps the content to the column, so a table wider than its room scrolls in its own box.
  ".cm-content": { padding: "1.5rem 1rem 4rem", minWidth: "0", caretColor: "var(--link)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--link)" },
  ".cm-line": { padding: "0", maxWidth: "var(--read-width)", boxSizing: "border-box" },
  ".cm-lp-blank": { lineHeight: "0.5rem" },
  ".cm-lp-h1": HEADING("h1", "2rem"),
  ".cm-lp-h2": { ...HEADING("h2", "2.25rem"), ...SECTION_RULE },
  ".cm-lp-h3": HEADING("h3", "1.5rem"),
  ".cm-lp-h4, .cm-lp-h5, .cm-lp-h6": { fontWeight: "600", paddingTop: "1rem" },
  ".cm-lp-h5, .cm-lp-h6": MUTED,
  // An h2 right under an h1 opens the h1's first section: no rule between them.
  ".cm-lp-h1 + .cm-lp-blank + .cm-lp-h2, .cm-lp-h1 + .cm-lp-h2": { paddingTop: "1rem", backgroundImage: "none" },
  // A heading on the first line has no space above it.
  ".cm-content > .cm-line:first-child:is(.cm-lp-h1, .cm-lp-h2, .cm-lp-h3, .cm-lp-h4, .cm-lp-h5, .cm-lp-h6)":
    FIRST_HEADING,
  // Under a hidden title line (`titleHidden`), the blank line after it takes no room and the next line no space above.
  ".cm-lp-title-gap + .cm-lp-blank": { lineHeight: "0" },
  ".cm-lp-title-gap + .cm-line, .cm-lp-title-gap + .cm-lp-blank + .cm-line": FIRST_HEADING,
  ".cm-lp-quote": { borderLeft: "1px solid var(--border)", paddingLeft: "1rem", ...MUTED },
  // A prompt's header, as its source: `text-xs` mono (14px) on 20px lines in the secondary ink.
  ".cm-lp-front": {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-xs)",
    lineHeight: "var(--text-xs--line-height)",
    ...MUTED,
  },
  // A code block: on a faint tint of the page, `text-xs` mono (14px) on 20px lines, 16px by 20px inside its 8px corners. Its lines
  // wrap: a wrapped line continues 2ch further in than it starts, as a list item's later lines hang past its marker.
  ".cm-lp-code": {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-xs)",
    lineHeight: "var(--text-xs--line-height)",
    backgroundColor: "var(--code-surface)",
    padding: `0 1.25rem 0 calc(1.25rem + ${CODE_HANG})`,
    textIndent: `-${CODE_HANG}`,
    tabSize: "4",
  },
  ".cm-lp-code-start": {
    paddingTop: "1rem",
    borderTopLeftRadius: "var(--doc-code-radius)",
    borderTopRightRadius: "var(--doc-code-radius)",
  },
  ".cm-lp-code-end": {
    paddingBottom: "1rem",
    borderBottomLeftRadius: "var(--doc-code-radius)",
    borderBottomRightRadius: "var(--doc-code-radius)",
  },
  ".cm-lp-fence": MUTED,
  ".cm-lp-label": { float: "right", ...MUTED, fontSize: "var(--text-xs)", textIndent: "0" },
  ".cm-lp-table": MONO,
  ".cm-lp-strong": { fontWeight: "600" },
  ".cm-lp-em": { fontStyle: "italic" },
  ".cm-lp-strike": { textDecoration: "line-through" },
  ".cm-lp-inline-code": INLINE_CODE,
  // Hidden backticks stand beside inline code as empty widgets between two widget buffers, and the buffers are images,
  // around which a line may always break: without them, a line never breaks between an opening bracket and the code
  // after it, nor between the code and the punctuation after it. The syntax is hidden only off the selection's lines,
  // so the cursor never stands by these buffers.
  [CODE_BUFFERS]: { display: "none" },
  ".cm-lp-inline-code-whole": { whiteSpace: "nowrap" },
  ".cm-lp-link": {
    color: "var(--link)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--link) 40%, transparent)",
    textUnderlineOffset: "3px",
    "&:hover": { textDecorationColor: "currentColor" },
  },
  // 8px between items; a list's first item, after a blank line, is 8px under the text above it, as a paragraph is.
  ".cm-lp-item-first": { paddingTop: "0.5rem" },
  ".cm-lp-blank + .cm-lp-item-first": { paddingTop: "0" },
  ".cm-lp-done, .cm-lp-number": MUTED,
  ".cm-lp-number": { display: "inline-block", minWidth: "1.25em", textIndent: "0" },
  ".cm-lp-bullet": { ...MUTED, display: "inline-block", width: `${INDENT}em`, textIndent: "0" },
  // The task's checkbox, 0.8em of the text it sits in (13.6px in the 17px body), so it grows with the text.
  ".cm-lp-task": {
    width: "0.8em",
    height: "0.8em",
    margin: "0 0.5rem 0 0",
    verticalAlign: "middle",
    accentColor: "var(--link)",
    cursor: "pointer",
  },
  ".cm-lp-task:disabled": { cursor: "default" },
  ...ITEM_STYLES,
  // A table ruled like a chart: no box and no vertical rule; the header row (600) on the band's tint over a hairline,
  // a light rule between rows, cells 6px by 12px, one size (the body's).
  // Words break between words, not anywhere as wrapped lines do: a column too narrow for a word scrolls instead.
  ".cm-lp-tablewrap": {
    maxWidth: "var(--read-width)",
    width: "fit-content",
    padding: "0.25rem 0",
    overflowX: "auto",
    cursor: "text",
    whiteSpace: "normal",
    wordBreak: "normal",
    overflowWrap: "normal",
  },
  ".cm-lp-tablewrap table": {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "inherit",
    lineHeight: "var(--text-doc--line-height)",
  },
  ".cm-lp-tablewrap th, .cm-lp-tablewrap td": {
    borderBottom: "1px solid var(--rule)",
    padding: "0.375rem 0.75rem",
    verticalAlign: "top",
  },
  ".cm-lp-tablewrap th": {
    fontWeight: "600",
    textAlign: "left",
    borderBottomColor: "var(--border)",
    backgroundColor: "var(--band)",
  },
  // A long path or identifier in a cell breaks anywhere, so it does not set its column's width; a short one stays whole.
  ".cm-lp-tablewrap code": { ...INLINE_CODE, overflowWrap: "anywhere" },
  ".cm-lp-tablewrap code.cm-lp-inline-code-whole": { whiteSpace: "nowrap" },
  // A code block, drawn while no selection line touches it (`CodeBlockWidget`): 8px corners on a faint tint of the page,
  // its language and Copy in a 32px head over a light rule, then `text-xs` mono (14px) on 20px lines, 12px by 16px inside, never
  // wrapped: a line wider than the text scrolls in the block. A block in a list starts at its item's text.
  ".cm-lp-codeblock": { maxWidth: "var(--read-width)", padding: "0.25rem 0", cursor: "text" },
  ".cm-lp-codebox": {
    borderRadius: "var(--doc-code-radius)",
    border: "1px solid var(--rule)",
    backgroundColor: "var(--code-surface)",
    overflow: "hidden",
  },
  ".cm-lp-codehead": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    height: "2rem",
    padding: "0 0.25rem 0 1rem",
    borderBottom: "1px solid var(--rule)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-xs)",
    lineHeight: "var(--text-xs--line-height)",
    ...MUTED,
  },
  ".cm-lp-copy": {
    height: "1.5rem",
    padding: "0 0.5rem",
    border: "0",
    borderRadius: "var(--radius-sm)",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
    "&:hover": { backgroundColor: "var(--accent)", color: "var(--foreground)" },
    "&:focus-visible": { outline: "2px solid var(--ring)", outlineOffset: "-2px" },
  },
  ".cm-lp-pre": {
    margin: "0",
    padding: "0.75rem 1rem",
    overflowX: "auto",
    whiteSpace: "pre",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-xs)",
    lineHeight: "var(--text-xs--line-height)",
    tabSize: "4",
    "&:focus-visible": { outline: "2px solid var(--ring)", outlineOffset: "-2px" },
  },
  ".cm-lp-hr": {
    display: "inline-block",
    width: "100%",
    verticalAlign: "middle",
    borderTop: "1px solid var(--border)",
  },
})

/** A heading's line: styled, and a heading of its level to assistive technology, which a line of an editor is not. */
const heading = (level: number): Decoration =>
  Decoration.line({ class: `cm-lp-h${level}`, attributes: { role: "heading", "aria-level": String(level) } })

const LINE: Record<LineKind, Decoration> = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(5),
  h6: heading(6),
  quote: Decoration.line({ class: "cm-lp-quote" }),
  code: Decoration.line({ class: "cm-lp-code" }),
  "code-start": Decoration.line({ class: "cm-lp-code-start" }),
  "code-end": Decoration.line({ class: "cm-lp-code-end" }),
  fence: Decoration.line({ class: "cm-lp-fence" }),
  table: Decoration.line({ class: "cm-lp-table" }),
  blank: Decoration.line({ class: "cm-lp-blank" }),
}

const MARK: Record<MarkKind, Decoration> = {
  strong: Decoration.mark({ class: "cm-lp-strong" }),
  em: Decoration.mark({ class: "cm-lp-em" }),
  strike: Decoration.mark({ class: "cm-lp-strike" }),
  code: Decoration.mark({ class: "cm-lp-inline-code" }),
  done: Decoration.mark({ class: "cm-lp-done" }),
  number: Decoration.mark({ class: "cm-lp-number" }),
  label: Decoration.mark({ class: "cm-lp-label" }),
}

/** Inline code no longer than `WHOLE_CODE`: never cut across two lines, at a hyphen or anywhere. */
const WHOLE_CODE_MARK = Decoration.mark({ class: "cm-lp-inline-code cm-lp-inline-code-whole" })

/** A mark's decoration: inline code short enough to stay whole keeps to one line. */
const markOf = (m: { kind: MarkKind; from: number; to: number }): Decoration =>
  m.kind === "code" && m.to - m.from <= WHOLE_CODE ? WHOLE_CODE_MARK : MARK[m.kind]

const HIDE = Decoration.replace({})

/** A line of a prompt's header (`frontMatter`), shown as its source. */
const FRONT = Decoration.line({ class: "cm-lp-front" })

/** A list item line's indent at `depth`, the marker hanging on its `first` line. */
const ITEM = (depth: number, first: boolean): Decoration =>
  Decoration.line({
    class: `cm-lp-item-${Math.min(depth, MAX_DEPTH)}${first ? " cm-lp-item-first" : ""}`,
  })

/** A bullet list marker, drawn as a bullet. */
class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span")
    span.className = "cm-lp-bullet"
    span.textContent = "•"
    return span
  }

  ignoreEvent(): boolean {
    return false
  }
}

/** A thematic break, drawn as a 1px rule across the line. */
class RuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span")
    span.className = "cm-lp-hr"
    span.setAttribute("role", "separator")
    return span
  }

  ignoreEvent(): boolean {
    return false
  }
}

/**
 * A task item's marker and box, drawn as a checkbox. `offset` is the distance from the widget's start to the character
 * between the brackets, which the editor's mousedown handler toggles; the box's own click changes nothing, so its state
 * always comes from the text. A `disabled` box, in a read-only view, cannot be ticked.
 */
class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly offset: number,
    readonly label: string,
    readonly disabled: boolean,
  ) {
    super()
  }

  eq(other: TaskWidget): boolean {
    return (
      other.checked === this.checked &&
      other.offset === this.offset &&
      other.label === this.label &&
      other.disabled === this.disabled
    )
  }

  toDOM(): HTMLElement {
    const input = document.createElement("input")
    input.type = "checkbox"
    input.className = "cm-lp-task"
    input.checked = this.checked
    input.disabled = this.disabled
    input.dataset.offset = String(this.offset)
    input.setAttribute("aria-label", this.label)
    input.addEventListener("click", (event) => event.preventDefault())
    return input
  }

  ignoreEvent(): boolean {
    return false
  }
}

/** A cell's text with its code spans as `code` elements, a short one (`WHOLE_CODE`) kept on one line. */
function cellContent(cell: HTMLElement, text: string): void {
  for (const part of inlineCode(text)) {
    if (part.code) {
      const code = document.createElement("code")
      if (part.text.length + 2 <= WHOLE_CODE) code.className = "cm-lp-inline-code-whole"
      code.textContent = part.text
      cell.append(code)
    } else cell.append(part.text)
  }
}

/**
 * A GFM table drawn as a table. In an editable view a click on it puts the cursor in its source, which then shows; in
 * a read-only one (`readOnly`) its wrapper takes the focus, so a table wider than its room scrolls from the keyboard.
 */
class TableWidget extends WidgetType {
  constructor(
    readonly block: TableBlock,
    readonly readOnly: boolean,
  ) {
    super()
  }

  eq(other: TableWidget): boolean {
    const a = this.block
    const b = other.block
    return (
      this.readOnly === other.readOnly &&
      JSON.stringify([a.header, a.align, a.rows]) === JSON.stringify([b.header, b.align, b.rows])
    )
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div")
    wrap.className = "cm-lp-tablewrap"
    if (this.readOnly) {
      wrap.tabIndex = 0
      wrap.setAttribute("role", "group")
      wrap.setAttribute("aria-label", "Table")
    }
    const table = document.createElement("table")
    const row = (cells: readonly string[], tag: "th" | "td"): HTMLTableRowElement => {
      const tr = document.createElement("tr")
      this.block.header.forEach((_, i) => {
        const cell = document.createElement(tag)
        const align = this.block.align[i]
        if (align !== null && align !== undefined) cell.style.textAlign = align
        cellContent(cell, cells[i] ?? "")
        tr.append(cell)
      })
      return tr
    }
    const head = document.createElement("thead")
    head.append(row(this.block.header, "th"))
    const body = document.createElement("tbody")
    for (const r of this.block.rows) body.append(row(r, "td"))
    table.append(head, body)
    wrap.append(table)
    return wrap
  }

  ignoreEvent(): boolean {
    return false
  }
}

/**
 * The tables no selection line touches, drawn as tables (block replacements, which only a state field may give); in a
 * read-only state no line is active, so every table is drawn.
 */
function tableDecorations(state: EditorState): DecorationSet {
  const active = activeLines(state.doc, state.selection.ranges, !state.readOnly)
  return Decoration.set(
    tableBlocks(state.doc, syntaxTree(state), active).map((b) =>
      Decoration.replace({ widget: new TableWidget(b, state.readOnly), block: true }).range(b.from, b.to),
    ),
  )
}

export const tables = StateField.define<DecorationSet>({
  create: tableDecorations,
  update: (set, tr) =>
    tr.docChanged || tr.selection !== undefined || syntaxTree(tr.startState) !== syntaxTree(tr.state)
      ? tableDecorations(tr.state)
      : set,
  provide: (field) => EditorView.decorations.from(field),
})

/** A run of a code line: its text, and the class its language's highlighting gives it (`""` for none). */
type CodeRun = readonly [string, string]

/** The lines of code block `block` in `state`, each cut into runs by the highlighting of its language. */
function codeRuns(state: EditorState, block: CodeBlock): CodeRun[][] {
  const first = block.lines[0]
  const last = block.lines.at(-1)
  if (first === undefined || last === undefined) return []
  const styled: { from: number; to: number; cls: string }[] = []
  highlightTree(
    syntaxTree(state),
    CODE_BLOCK_STYLES,
    (from, to, cls) => styled.push({ from, to, cls }),
    first.from,
    last.to,
  )
  let i = 0
  return block.lines.map((line) => {
    const runs: CodeRun[] = []
    let at = line.from
    while (i < styled.length && (styled[i] as { to: number }).to <= line.from) i++
    for (let j = i; j < styled.length; j++) {
      const s = styled[j] as { from: number; to: number; cls: string }
      if (s.from >= line.to) break
      const from = Math.max(s.from, line.from)
      const to = Math.min(s.to, line.to)
      if (from > at) runs.push([state.doc.sliceString(at, from), ""])
      if (to > from) runs.push([state.doc.sliceString(from, to), s.cls])
      at = Math.max(at, to)
    }
    if (at < line.to) runs.push([state.doc.sliceString(at, line.to), ""])
    return runs
  })
}

/**
 * A fenced code block drawn as a block: its language and a Copy button in its head, then its code, coloured, never
 * wrapped. In an editable view a click on it (but on Copy) puts the cursor in its source, which then shows; in a
 * read-only one its code takes the focus, so a line wider than its room scrolls from the keyboard, and its text selects
 * as any page's does.
 */
class CodeBlockWidget extends WidgetType {
  constructor(
    readonly label: string | null,
    readonly depth: number,
    readonly runs: readonly CodeRun[][],
    readonly readOnly: boolean,
  ) {
    super()
  }

  eq(other: CodeBlockWidget): boolean {
    return (
      this.label === other.label &&
      this.depth === other.depth &&
      this.readOnly === other.readOnly &&
      JSON.stringify(this.runs) === JSON.stringify(other.runs)
    )
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div")
    wrap.className = "cm-lp-codeblock"
    if (this.depth > 0) wrap.style.paddingLeft = `${Math.min(this.depth, MAX_DEPTH) * INDENT}em`
    const box = document.createElement("div")
    box.className = "cm-lp-codebox"
    const head = document.createElement("div")
    head.className = "cm-lp-codehead"
    const label = document.createElement("span")
    label.textContent = this.label ?? ""
    const copy = document.createElement("button")
    copy.type = "button"
    copy.className = "cm-lp-copy"
    copy.textContent = "Copy"
    const text = this.runs.map((line) => line.map(([run]) => run).join("")).join("\n")
    let reset: ReturnType<typeof setTimeout> | undefined
    // The editor's host copies it (`useCodeCopy`): a widget is plain DOM, out of React's reach.
    copy.addEventListener("click", () => {
      copy.dispatchEvent(new CustomEvent(CODE_COPY_EVENT, { bubbles: true, detail: text }))
      copy.textContent = "Copied"
      clearTimeout(reset)
      reset = setTimeout(() => (copy.textContent = "Copy"), 1500)
    })
    head.append(label, copy)
    const pre = document.createElement("pre")
    pre.className = "cm-lp-pre"
    if (this.readOnly) {
      pre.tabIndex = 0
      pre.setAttribute("role", "group")
      pre.setAttribute("aria-label", this.label !== null ? `${this.label} code` : "Code")
    }
    const code = document.createElement("code")
    this.runs.forEach((line, n) => {
      if (n > 0) code.append("\n")
      for (const [run, cls] of line) {
        if (cls === "") code.append(run)
        else {
          const span = document.createElement("span")
          span.className = cls
          span.textContent = run
          code.append(span)
        }
      }
    })
    pre.append(code)
    box.append(head, pre)
    wrap.append(box)
    return wrap
  }

  ignoreEvent(event: Event): boolean {
    return this.readOnly || (event.target instanceof Element && event.target.closest(".cm-lp-copy") !== null)
  }
}

/**
 * The fenced code blocks no selection line touches, drawn as blocks (block replacements, which only a state field may
 * give); in a read-only state no line is active, so every block is drawn.
 */
function codeDecorations(state: EditorState): DecorationSet {
  const active = activeLines(state.doc, state.selection.ranges, !state.readOnly)
  return Decoration.set(
    codeBlocks(state.doc, syntaxTree(state), active).map((b) =>
      Decoration.replace({
        widget: new CodeBlockWidget(b.label, b.depth, codeRuns(state, b), state.readOnly),
        block: true,
      }).range(b.from, b.to),
    ),
  )
}

export const codeBlockField = StateField.define<DecorationSet>({
  create: codeDecorations,
  update: (set, tr) =>
    tr.docChanged || tr.selection !== undefined || syntaxTree(tr.startState) !== syntaxTree(tr.state)
      ? codeDecorations(tr.state)
      : set,
  provide: (field) => EditorView.decorations.from(field),
})

/** A soft line break, joined: one space in place of the break and the next line's indentation and quote marks. */
class SpaceWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span")
    span.textContent = " "
    return span
  }
}

const SPACE = Decoration.replace({ widget: new SpaceWidget() })

/** Tells the state whether the editor has the focus. */
export const setFocused = StateEffect.define<boolean>()

/**
 * Whether the editor has the focus, kept in the state: the decorations only a state field may give (a joined line
 * break) follow the focus as the live preview's own do. A state taken from a view that had the focus says so until
 * its next view corrects it.
 */
const focused = StateField.define<boolean>({
  create: () => false,
  update: (value, tr) => tr.effects.reduce((v, e) => (e.is(setFocused) ? e.value : v), value),
})

const trackFocus = EditorView.focusChangeEffect.of((_, focusing) => setFocused.of(focusing))

/**
 * The soft breaks joined in `state`: every paragraph's, but the ones the selection touches while an editable editor
 * has the focus.
 */
function softBreakDecorations(state: EditorState): DecorationSet {
  const editing = !state.readOnly && state.field(focused, false) === true
  const active = activeLines(state.doc, state.selection.ranges, editing)
  const header = frontMatter(state.doc)
  return Decoration.set(
    softBreakSpans(state.doc, syntaxTree(state), active)
      .filter((b) => header === null || b.from > header.to)
      .map((b) => SPACE.range(b.from, b.to)),
  )
}

/**
 * The soft line breaks of a document, each replaced by a space so a paragraph flows as one, as CommonMark renders it.
 * In an editable editor that has the focus, the paragraph the selection is in keeps its line breaks, as its source has
 * them, the way its syntax shows there; a read-only document flows whole. The replacements cover line breaks, which
 * only decorations given directly from state may do.
 */
export const softBreaks = StateField.define<DecorationSet>({
  create: softBreakDecorations,
  update: (set, tr) =>
    tr.docChanged ||
    tr.selection !== undefined ||
    tr.startState.field(focused, false) !== tr.state.field(focused, false) ||
    syntaxTree(tr.startState) !== syntaxTree(tr.state)
      ? softBreakDecorations(tr.state)
      : set,
  provide: (field) => EditorView.decorations.from(field),
})

/** Gives the state the page's title (`ItemHeading`'s), `null` when the page states none. */
export const setTitle = StateEffect.define<string | null>()

/** The page's title, which the document's first line may restate (`titleLine`). */
const pageTitle = StateField.define<string | null>({
  create: () => null,
  update: (value, tr) => tr.effects.reduce((v, e) => (e.is(setTitle) ? e.value : v), value),
})

/** The hidden title line's place: an empty block, which the text after it starts under as a first line does. */
class TitleGapWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const div = document.createElement("div")
    div.className = "cm-lp-title-gap"
    div.setAttribute("aria-hidden", "true")
    return div
  }
}

const HIDE_LINE = Decoration.replace({ widget: new TitleGapWidget(), block: true })

/**
 * The document's first line hidden when it is an h1 restating the page's title, so the title reads once: always in a
 * read-only state; in an editable one, unless the editor has the focus with the selection on that line, where it shows
 * as written, as the live preview's syntax does.
 */
function titleDecorations(state: EditorState): DecorationSet {
  const line = titleLine(state.doc, state.field(pageTitle, false) ?? null)
  if (line === null) return Decoration.none
  const editing = !state.readOnly && state.field(focused, false) === true
  if (activeLines(state.doc, state.selection.ranges, editing).has(1)) return Decoration.none
  return Decoration.set([HIDE_LINE.range(line.from, line.to)])
}

/** The first line's h1 hidden while it restates the page's title (`titleDecorations`), a block replacement. */
export const titleHidden = StateField.define<DecorationSet>({
  create: titleDecorations,
  update: (set, tr) =>
    tr.docChanged || tr.selection !== undefined || tr.effects.length > 0 ? titleDecorations(tr.state) : set,
  provide: (field) => EditorView.decorations.from(field),
})

/**
 * A mousedown on a drawn table puts the cursor at its start, and on a drawn code block (but on its Copy button) at its
 * code's first line, so its source shows for editing.
 */
const blockClick = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target
    if (!(target instanceof Element) || target.closest(".cm-lp-copy") !== null) return false
    const wrap = target.closest<HTMLElement>(".cm-lp-tablewrap, .cm-lp-codeblock")
    if (wrap === null) return false
    const at = view.posAtDOM(wrap)
    const doc = view.state.doc
    const anchor = wrap.classList.contains("cm-lp-codeblock") ? Math.min(doc.lineAt(at).to + 1, doc.length) : at
    view.dispatch({ selection: { anchor } })
    view.focus()
    return true
  },
})

const BULLET = Decoration.replace({ widget: new BulletWidget() })
const RULE = Decoration.replace({ widget: new RuleWidget() })

/** The decoration of a widget of the plan; a task box is disabled in a `readOnly` view. */
function widgetDecoration(w: Widget, readOnly: boolean): Decoration {
  if (w.kind === "bullet") return BULLET
  if (w.kind === "hr") return RULE
  return Decoration.replace({ widget: new TaskWidget(w.checked, w.toggle - w.from, w.label, readOnly) })
}

/**
 * The mark of a link to `href`. In a read-only view it is an anchor that opens `href` in a new tab, so Tab and Enter, a
 * middle click and the context menu reach it as they reach any link; in an editable view a span, which Cmd or Ctrl and
 * a click opens.
 */
export function linkMark(href: string, readOnly: boolean): Decoration {
  return readOnly
    ? Decoration.mark({
        tagName: "a",
        class: "cm-lp-link",
        attributes: { href, target: "_blank", rel: "noopener noreferrer" },
      })
    : Decoration.mark({ class: "cm-lp-link", attributes: { "data-href": href } })
}

/**
 * The live preview's decorations for the visible ranges of `view`, the syntax shown on the selection's lines; none is
 * shown in a read-only view.
 */
function decorations(view: EditorView): DecorationSet {
  const state = view.state
  const active = activeLines(state.doc, state.selection.ranges, view.hasFocus && !state.readOnly)
  const plan = decorationPlan(state.doc, syntaxTree(state), active, view.visibleRanges)
  // A prompt's header is shown as its source, each line in mono: nothing of the Markdown read into it is drawn.
  const header = frontMatter(state.doc)
  const body = (at: { from: number }) => header === null || at.from > header.to
  const ranges: Range<Decoration>[] = [
    ...plan.lines.filter(body).map((l) => LINE[l.kind].range(l.from)),
    ...plan.items.filter(body).map((i) => ITEM(i.depth, i.first).range(i.from)),
    ...plan.marks
      .filter(body)
      .map((m) =>
        m.kind === "link" ? linkMark(m.href, state.readOnly).range(m.from, m.to) : markOf(m).range(m.from, m.to),
      ),
    ...plan.hidden.filter(body).map((h) => HIDE.range(h.from, h.to)),
    ...plan.widgets.filter(body).map((w) => widgetDecoration(w, state.readOnly).range(w.from, w.to)),
  ]
  if (header !== null)
    for (let n = 1; n <= state.doc.lineAt(header.to).number; n++) ranges.push(FRONT.range(state.doc.line(n).from))
  return Decoration.set(ranges, true)
}

/**
 * The live preview: rebuilt on a change of the text, the selection, the focus, the viewport or the parsed tree. A
 * mousedown on a task box toggles it (one character, undoable); Cmd or Ctrl and a click on a link opens its target in a
 * new tab when it is http:, https: or mailto:. In a read-only view a task box does not toggle, and a link is an anchor
 * that a click opens, except a click that selected text or a double or triple click.
 */
const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = decorations(view)
    }

    update(u: ViewUpdate): void {
      if (
        u.docChanged ||
        u.selectionSet ||
        u.focusChanged ||
        u.viewportChanged ||
        syntaxTree(u.startState) !== syntaxTree(u.state)
      )
        this.decorations = decorations(u.view)
    }
  },
  {
    decorations: (p) => p.decorations,
    eventHandlers: {
      mousedown(event, view) {
        const target = event.target
        if (target instanceof HTMLInputElement && target.classList.contains("cm-lp-task")) {
          if (view.state.readOnly) return true
          const at = view.posAtDOM(target) + Number(target.dataset.offset)
          const change = taskToggle(view.state.doc, at)
          if (change !== null) view.dispatch({ changes: change, userEvent: "input" })
          return true
        }
        if (view.state.readOnly || !(event.metaKey || event.ctrlKey)) return false
        return openLink(target)
      },
      click(event, view) {
        // Enter on a link clicks it with a `detail` of 0, whatever the selection.
        const select = event.detail > 1 || (event.detail === 1 && !view.state.selection.main.empty)
        if (!view.state.readOnly || !select) return false
        const target = event.target
        return target instanceof Element && target.closest("a.cm-lp-link") !== null
      },
    },
  },
)

/** Opens the link `target` is in, in a new tab, when its target is http:, https: or mailto:; whether it did. */
function openLink(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const href = target.closest<HTMLElement>(".cm-lp-link")?.dataset.href
  if (href === undefined || !isLinkTarget(href)) return false
  window.open(href, "_blank", "noopener,noreferrer")
  return true
}

/** Marks a state that holds the live preview's extension set. */
const LIVE = Facet.define<boolean, boolean>({ combine: (values) => values.length > 0 })

/**
 * The extension set of a live Markdown view: GFM Markdown with fenced code parsed in the languages of the list and
 * coloured by their scoped highlight styles, the live preview, history with the stock keys and `Mod-Shift-z` as redo,
 * the formatting keys, wrapped lines, no gutters, the accessible name, the file's line separator and the style nonce.
 * It binds no `Mod-s`: saving is the page's. `readOnly` gives the set of a read view: not editable, no history, no keys,
 * no table or code block click, no line ever active, so the text always shows formatted. Either set joins soft line
 * breaks.
 */
export function liveExtensions({
  name,
  separator,
  readOnly = false,
  title = null,
}: {
  name: string
  separator: string
  readOnly?: boolean
  /** The page's title, whose restatement as the document's first line is hidden (`titleHidden`). */
  title?: string | null
}): Extension[] {
  const preview: Extension[] = [
    // A read view's links take focus, so its keys reach the editor: Markdown's Enter and Backspace and its URL paste
    // would edit the read-only document.
    markdown({
      base: markdownLanguage,
      codeLanguages: CODE_LANGUAGES,
      addKeymap: !readOnly,
      pasteURLAsLink: !readOnly,
    }),
    CODE_BLOCK_STYLES.map((style) => syntaxHighlighting(style)),
    livePreview,
    tables,
    codeBlockField,
    softBreaks,
    pageTitle.init(() => title),
    titleHidden,
  ]
  if (readOnly)
    return [
      LIVE.of(true),
      ...preview,
      THEME,
      EditorView.lineWrapping,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.contentAttributes.of({ "aria-label": name, "aria-readonly": "true" }),
      EditorState.lineSeparator.of(separator),
      EditorView.cspNonce.of(meta("nonce")),
    ]
  return [
    LIVE.of(true),
    history(),
    formattingKeymap,
    keymap.of([...defaultKeymap, ...historyKeymap]),
    keymap.of([{ key: "Mod-Shift-z", run: redo, preventDefault: true }]),
    ...preview,
    focused,
    trackFocus,
    blockClick,
    THEME,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ "aria-label": name }),
    EditorState.lineSeparator.of(separator),
    EditorView.cspNonce.of(meta("nonce")),
  ]
}

/**
 * The effect that gives `state` the live set with the page's `title`, keeping its text, selection, undo history and
 * line separator.
 */
const toLive = (state: EditorState, name: string, title: string | null): StateEffect<unknown> =>
  StateEffect.reconfigure.of(liveExtensions({ name, separator: state.lineBreak, title }))

/** Puts the cursor at the start of line `line` (from 1) of the store's mounted view, scrolled into view and focused. */
export function goToLine(store: DraftStore, line: number): void {
  const v = store.view
  if (v === null) return
  const at = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines)).from
  v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: "center" }) })
  v.focus()
}

/**
 * A Markdown draft, editable where it is read: formatted, its syntax shown on the lines the selection touches, with its
 * outline at its right while the page has room (`OutlinedDoc`). It mounts
 * the draft's state and dispatches through it as the editable code view does; a state without the live set (the
 * draft's first one, or one taken by Discard, Reload or Restore) is reconfigured to it, which keeps the text, the
 * selection and the undo history.
 */
export function LiveMarkdown({
  store,
  name,
  title = null,
  className,
}: {
  store: DraftStore
  name: string
  /** The page's title: a first line restating it is hidden off its line (`titleHidden`). */
  title?: string | null
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const latestTitle = useRef(title)
  useCodeCopy(host)

  // Before the mount below, so a new view takes the current title.
  useEffect(() => {
    latestTitle.current = title
    const v = store.view
    if (v !== null && v.state.field(pageTitle, false) !== title) v.dispatch({ effects: setTitle.of(title) })
  }, [store, title])

  useEffect(() => {
    if (host.current === null) return
    const title = latestTitle.current
    const v = new EditorView({
      state: store.state.facet(LIVE)
        ? store.state.field(pageTitle, false) === title
          ? store.state
          : store.state.update({ effects: setTitle.of(title) }).state
        : store.state.update({ effects: toLive(store.state, name, title) }).state,
      parent: host.current,
      dispatchTransactions: (trs, view) => {
        view.update(trs)
        store.set(view.state)
      },
    })
    store.attach(v)
    // A state kept from a view that had the focus: this view starts without it.
    if (v.state.field(focused, false) === true && !v.hasFocus) v.dispatch({ effects: setFocused.of(false) })
    if (v.state !== store.state) store.set(v.state)
    return () => {
      store.detach(v)
      v.destroy()
    }
  }, [store, name])

  // Again for a new state (Discard, Reload, Restore), which holds the code view's set.
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const generation = store.generation
  useEffect(() => {
    const v = store.view
    if (v !== null && !v.state.facet(LIVE)) v.dispatch({ effects: toLive(v.state, name, latestTitle.current) })
  }, [store, name, generation])

  const outline = useMemo(
    () => outlineOf(state.doc, ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state), title),
    [state, title],
  )
  const view = useCallback(() => store.view, [store])

  return (
    <OutlinedDoc entries={outline} view={view}>
      <div ref={host} className={cn("h-full min-h-0", className)} />
    </OutlinedDoc>
  )
}
