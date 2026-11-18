import { defaultKeymap, history, historyKeymap, redo } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { syntaxHighlighting, syntaxTree } from "@codemirror/language"
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
import { cn } from "cn"
import { useEffect, useRef, useSyncExternalStore } from "react"

import { formattingKeymap } from "@/components/markdown-editor"
import { meta } from "@/data/api"
import type { DraftStore } from "@/drafts/draft-store"
import { inlineCode, isLinkTarget } from "@/lib/changes"
import { CODE_BLOCK_STYLES, CODE_LANGUAGES } from "@/lib/code-languages"
import {
  activeLines,
  decorationPlan,
  type LineKind,
  type MarkKind,
  softBreaks as softBreakSpans,
  type TableBlock,
  tableBlocks,
  taskToggle,
  type Widget,
} from "@/lib/live-preview"

const MUTED = { color: "var(--muted-foreground)" }
const MONO = { fontFamily: "var(--font-mono)", fontSize: "85%" }
/** Inline code: 85% Geist Mono on a soft tint, in the text's colour. */
const INLINE_CODE = {
  fontFamily: "var(--font-mono)",
  fontSize: "85%",
  padding: "0.2em 0.4em",
  borderRadius: "var(--radius-sm)",
  backgroundColor: "var(--doc-code-tint)",
}
/** The wider room of code blocks and tables, centred in the column. */
const WIDE = { maxWidth: "var(--read-wide)" }
/** A heading at Notion's scale: 600, its size and line height from the `--text-doc-*` tokens. */
const HEADING = (level: string, space: string) => ({
  fontSize: `var(--text-doc-${level})`,
  lineHeight: `var(--text-doc-${level}--line-height)`,
  fontWeight: "600",
  paddingTop: space,
})

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

/**
 * Notion's scale and rhythm: body 16/24 in the document's colour; a blank line between two blocks
 * 8px tall; space above a heading (with the blank line before it, 32px above h1, 24px above h2, 16px above h3); 36px
 * from one list item to the next.
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
  // The column's 24px gutters; each line centred at most `--read-width` wide, code and tables `--read-wide`.
  // `minWidth: 0` keeps the content to the column, so a table wider than its room scrolls in its own box.
  ".cm-content": { padding: "1.5rem 1.5rem 4rem", minWidth: "0", caretColor: "var(--link)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--link)" },
  ".cm-line": { padding: "0", maxWidth: "var(--read-width)", marginInline: "auto", boxSizing: "border-box" },
  ".cm-lp-blank": { lineHeight: "0.5rem" },
  ".cm-lp-h1": HEADING("h1", "1.5rem"),
  ".cm-lp-h2": HEADING("h2", "1rem"),
  ".cm-lp-h3": HEADING("h3", "0.5rem"),
  ".cm-lp-h4, .cm-lp-h5, .cm-lp-h6": { fontWeight: "600", paddingTop: "0.5rem" },
  ".cm-lp-h5, .cm-lp-h6": MUTED,
  // A heading on the first line has no space above it.
  ".cm-content > .cm-line:first-child:is(.cm-lp-h1, .cm-lp-h2, .cm-lp-h3, .cm-lp-h4, .cm-lp-h5, .cm-lp-h6)": {
    paddingTop: "0",
  },
  ".cm-lp-quote": { borderLeft: "3px solid var(--input)", paddingLeft: "1rem", ...MUTED },
  // A code block: on a faint tint of the page, 85% mono at 1.5, 16px by 20px inside its 10px corners.
  ".cm-lp-code": {
    ...WIDE,
    fontFamily: "var(--font-mono)",
    fontSize: "85%",
    lineHeight: "1.5",
    backgroundColor: "var(--code-surface)",
    padding: "0 1.25rem",
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
  ".cm-lp-label": { float: "right", ...MUTED, fontSize: "var(--text-xs)" },
  ".cm-lp-table": { ...MONO, ...WIDE },
  ".cm-lp-strong": { fontWeight: "600" },
  ".cm-lp-em": { fontStyle: "italic" },
  ".cm-lp-strike": { textDecoration: "line-through" },
  ".cm-lp-inline-code": INLINE_CODE,
  ".cm-lp-link": {
    fontWeight: "500",
    textDecoration: "underline",
    textDecorationColor: "var(--input)",
    textUnderlineOffset: "3px",
    "&:hover": { textDecorationColor: "currentColor" },
  },
  // 12px between items; a list's first item, after a blank line, is 8px under the text above it, as a paragraph is.
  ".cm-lp-item-first": { paddingTop: "0.75rem" },
  ".cm-lp-blank + .cm-lp-item-first": { paddingTop: "0" },
  ".cm-lp-done, .cm-lp-number": MUTED,
  ".cm-lp-number": { display: "inline-block", minWidth: "1.25em", textIndent: "0" },
  ".cm-lp-bullet": { ...MUTED, display: "inline-block", width: `${INDENT}em`, textIndent: "0" },
  ".cm-lp-task": {
    width: "13px",
    height: "13px",
    margin: "0 8px 0 0",
    verticalAlign: "middle",
    accentColor: "var(--link)",
    cursor: "pointer",
  },
  ".cm-lp-task:disabled": { cursor: "default" },
  ...ITEM_STYLES,
  // A table: 1px rules, the header row on the muted surface at 600, tabular numbers.
  // Words break between words, not anywhere as wrapped lines do: a column too narrow for a word scrolls instead.
  ".cm-lp-tablewrap": {
    ...WIDE,
    marginInline: "auto",
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
    border: "1px solid var(--border)",
    fontSize: "inherit",
    lineHeight: "var(--text-doc--line-height)",
    fontVariantNumeric: "tabular-nums",
  },
  ".cm-lp-tablewrap th, .cm-lp-tablewrap td": {
    border: "1px solid var(--border)",
    padding: "0.5em 0.75em",
    verticalAlign: "top",
  },
  ".cm-lp-tablewrap th": { fontWeight: "600", backgroundColor: "var(--muted)", textAlign: "left" },
  // A long path or identifier in a cell breaks anywhere, so it does not set its column's width.
  ".cm-lp-tablewrap code": { ...INLINE_CODE, overflowWrap: "anywhere" },
  ".cm-lp-hr": {
    display: "inline-block",
    width: "100%",
    verticalAlign: "middle",
    borderTop: "1px solid var(--border)",
  },
})

const LINE: Record<LineKind, Decoration> = {
  h1: Decoration.line({ class: "cm-lp-h1" }),
  h2: Decoration.line({ class: "cm-lp-h2" }),
  h3: Decoration.line({ class: "cm-lp-h3" }),
  h4: Decoration.line({ class: "cm-lp-h4" }),
  h5: Decoration.line({ class: "cm-lp-h5" }),
  h6: Decoration.line({ class: "cm-lp-h6" }),
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

const HIDE = Decoration.replace({})

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

/** A cell's text with its code spans as `code` elements. */
function cellContent(cell: HTMLElement, text: string): void {
  for (const part of inlineCode(text)) {
    if (part.code) {
      const code = document.createElement("code")
      code.textContent = part.text
      cell.append(code)
    } else cell.append(part.text)
  }
}

/** A GFM table drawn as a table; a click on it puts the cursor in its source, which then shows. */
class TableWidget extends WidgetType {
  constructor(readonly block: TableBlock) {
    super()
  }

  eq(other: TableWidget): boolean {
    const a = this.block
    const b = other.block
    return JSON.stringify([a.header, a.align, a.rows]) === JSON.stringify([b.header, b.align, b.rows])
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div")
    wrap.className = "cm-lp-tablewrap"
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
      Decoration.replace({ widget: new TableWidget(b), block: true }).range(b.from, b.to),
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

const softBreakDecorations = (state: EditorState): DecorationSet =>
  Decoration.set(softBreakSpans(state.doc, syntaxTree(state)).map((b) => SPACE.range(b.from, b.to)))

/**
 * A read view's soft line breaks, each replaced by a space so a paragraph flows as one, as CommonMark renders it. The
 * replacements cover line breaks, which only decorations given directly from state may do.
 */
export const softBreaks = StateField.define<DecorationSet>({
  create: softBreakDecorations,
  update: (set, tr) =>
    tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state) ? softBreakDecorations(tr.state) : set,
  provide: (field) => EditorView.decorations.from(field),
})

/** A mousedown on a drawn table puts the cursor at its start, so its source shows for editing. */
const tableClick = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target
    const wrap = target instanceof Element ? target.closest<HTMLElement>(".cm-lp-tablewrap") : null
    if (wrap === null) return false
    view.dispatch({ selection: { anchor: view.posAtDOM(wrap) } })
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
  const ranges: Range<Decoration>[] = [
    ...plan.lines.map((l) => LINE[l.kind].range(l.from)),
    ...plan.items.map((i) => ITEM(i.depth, i.first).range(i.from)),
    ...plan.marks.map((m) =>
      m.kind === "link" ? linkMark(m.href, state.readOnly).range(m.from, m.to) : MARK[m.kind].range(m.from, m.to),
    ),
    ...plan.hidden.map((h) => HIDE.range(h.from, h.to)),
    ...plan.widgets.map((w) => widgetDecoration(w, state.readOnly).range(w.from, w.to)),
  ]
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
 * no table click, no line ever active, so the text always shows formatted, and soft line breaks joined.
 */
export function liveExtensions({
  name,
  separator,
  readOnly = false,
}: {
  name: string
  separator: string
  readOnly?: boolean
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
  ]
  if (readOnly)
    return [
      LIVE.of(true),
      ...preview,
      softBreaks,
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
    tableClick,
    THEME,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ "aria-label": name }),
    EditorState.lineSeparator.of(separator),
    EditorView.cspNonce.of(meta("nonce")),
  ]
}

/** The effect that gives `state` the live set, keeping its text, selection, undo history and line separator. */
const toLive = (state: EditorState, name: string): StateEffect<unknown> =>
  StateEffect.reconfigure.of(liveExtensions({ name, separator: state.lineBreak }))

/**
 * A Markdown draft, editable where it is read: formatted, its syntax shown on the lines the selection touches. It mounts
 * the draft's state and dispatches through it as the editable code view does; a state without the live set (the
 * draft's first one, or one taken by Discard, Reload or Restore) is reconfigured to it, which keeps the text, the
 * selection and the undo history.
 */
export function LiveMarkdown({ store, name, className }: { store: DraftStore; name: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (host.current === null) return
    const v = new EditorView({
      state: store.state.facet(LIVE) ? store.state : store.state.update({ effects: toLive(store.state, name) }).state,
      parent: host.current,
      dispatchTransactions: (trs, view) => {
        view.update(trs)
        store.set(view.state)
      },
    })
    store.attach(v)
    if (v.state !== store.state) store.set(v.state)
    return () => {
      store.detach(v)
      v.destroy()
    }
  }, [store, name])

  // Again for a new state (Discard, Reload, Restore), which holds the code view's set.
  useSyncExternalStore(store.subscribe, store.getState)
  const generation = store.generation
  useEffect(() => {
    const v = store.view
    if (v !== null && !v.state.facet(LIVE)) v.dispatch({ effects: toLive(v.state, name) })
  }, [store, name, generation])

  return <div ref={host} className={cn("h-full min-h-0", className)} />
}
