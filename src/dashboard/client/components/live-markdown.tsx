import { defaultKeymap, history, historyKeymap, redo } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { syntaxTree } from "@codemirror/language"
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

import type { DraftStore } from "@/components/code-view"
import { formattingKeymap } from "@/components/markdown-editor"
import { inlineCode, isLinkTarget } from "@/lib/changes"
import {
  activeLines,
  decorationPlan,
  type LineKind,
  type MarkKind,
  type TableBlock,
  tableBlocks,
  taskToggle,
  type Widget,
} from "@/lib/live-preview"

/** The style nonce of this page's response, which CodeMirror puts on the `<style>` tags it injects. */
const nonce = (): string => document.querySelector<HTMLMetaElement>('meta[name="theway-nonce"]')?.content ?? ""

const MUTED = { color: "var(--muted-foreground)" }
const MONO = { fontFamily: "var(--font-mono)", fontSize: "0.75rem" }

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

const THEME = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--background)", color: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-sans)", fontSize: "0.875rem", lineHeight: "1.5rem", overflow: "auto" },
  ".cm-content": { padding: "2rem 3.5rem", maxWidth: "40rem", boxSizing: "content-box", caretColor: "var(--link)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--link)" },
  ".cm-line": { padding: "0" },
  ".cm-lp-h1": { fontSize: "1rem", fontWeight: "600" },
  ".cm-lp-h2, .cm-lp-h3": { fontSize: "0.875rem", fontWeight: "600" },
  ".cm-lp-h4, .cm-lp-h5, .cm-lp-h6": { fontSize: "0.875rem", fontWeight: "600", ...MUTED },
  ".cm-lp-quote": { borderLeft: "1px solid var(--border)", paddingLeft: "12px", ...MUTED },
  ".cm-lp-code": { ...MONO, backgroundColor: "var(--muted)", padding: "0 12px" },
  ".cm-lp-fence": MUTED,
  ".cm-lp-table": MONO,
  ".cm-lp-strong": { fontWeight: "600" },
  ".cm-lp-em": { fontStyle: "italic" },
  ".cm-lp-strike": { textDecoration: "line-through" },
  ".cm-lp-inline-code": {
    ...MONO,
    backgroundColor: "var(--muted)",
    borderRadius: "var(--radius-sm)",
    padding: "0 4px",
  },
  ".cm-lp-link": { color: "var(--link)", textDecoration: "underline", textUnderlineOffset: "3px" },
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
  ...ITEM_STYLES,
  ".cm-lp-tablewrap": { padding: "4px 0", overflowX: "auto", cursor: "text" },
  ".cm-lp-tablewrap table": { borderCollapse: "collapse", fontSize: "0.875rem", lineHeight: "1.25rem" },
  ".cm-lp-tablewrap th, .cm-lp-tablewrap td": {
    border: "1px solid var(--border)",
    padding: "4px 8px",
    verticalAlign: "top",
    minWidth: "7rem",
  },
  ".cm-lp-tablewrap th": { fontWeight: "600", backgroundColor: "var(--muted)", textAlign: "left" },
  ".cm-lp-tablewrap code": {
    ...MONO,
    backgroundColor: "var(--muted)",
    borderRadius: "var(--radius-sm)",
    padding: "0 4px",
  },
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
  fence: Decoration.line({ class: "cm-lp-fence" }),
  table: Decoration.line({ class: "cm-lp-table" }),
}

const MARK: Record<MarkKind, Decoration> = {
  strong: Decoration.mark({ class: "cm-lp-strong" }),
  em: Decoration.mark({ class: "cm-lp-em" }),
  strike: Decoration.mark({ class: "cm-lp-strike" }),
  code: Decoration.mark({ class: "cm-lp-inline-code" }),
  done: Decoration.mark({ class: "cm-lp-done" }),
  number: Decoration.mark({ class: "cm-lp-number" }),
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
 * always comes from the text.
 */
class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly offset: number,
    readonly label: string,
  ) {
    super()
  }

  eq(other: TaskWidget): boolean {
    return other.checked === this.checked && other.offset === this.offset && other.label === this.label
  }

  toDOM(): HTMLElement {
    const input = document.createElement("input")
    input.type = "checkbox"
    input.className = "cm-lp-task"
    input.checked = this.checked
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

/** The tables no selection line touches, drawn as tables (block replacements, which only a state field may give). */
function tableDecorations(state: EditorState): DecorationSet {
  const active = activeLines(state.doc, state.selection.ranges, true)
  return Decoration.set(
    tableBlocks(state.doc, syntaxTree(state), active).map((b) =>
      Decoration.replace({ widget: new TableWidget(b), block: true }).range(b.from, b.to),
    ),
  )
}

const tables = StateField.define<DecorationSet>({
  create: tableDecorations,
  update: (set, tr) =>
    tr.docChanged || tr.selection !== undefined || syntaxTree(tr.startState) !== syntaxTree(tr.state)
      ? tableDecorations(tr.state)
      : set,
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

/** The decoration of a widget of the plan. */
function widgetDecoration(w: Widget): Decoration {
  if (w.kind === "bullet") return BULLET
  if (w.kind === "hr") return RULE
  return Decoration.replace({ widget: new TaskWidget(w.checked, w.toggle - w.from, w.label) })
}

/** The live preview's decorations for the visible ranges of `view`, the syntax shown on the selection's lines. */
function decorations(view: EditorView): DecorationSet {
  const state = view.state
  const active = activeLines(state.doc, state.selection.ranges, view.hasFocus)
  const plan = decorationPlan(state.doc, syntaxTree(state), active, view.visibleRanges)
  const ranges: Range<Decoration>[] = [
    ...plan.lines.map((l) => LINE[l.kind].range(l.from)),
    ...plan.items.map((i) => ITEM(i.depth, i.first).range(i.from)),
    ...plan.marks.map((m) =>
      m.kind === "link"
        ? Decoration.mark({ class: "cm-lp-link", attributes: { "data-href": m.href } }).range(m.from, m.to)
        : MARK[m.kind].range(m.from, m.to),
    ),
    ...plan.hidden.map((h) => HIDE.range(h.from, h.to)),
    ...plan.widgets.map((w) => widgetDecoration(w).range(w.from, w.to)),
  ]
  return Decoration.set(ranges, true)
}

/**
 * The live preview: rebuilt on a change of the text, the selection, the focus, the viewport or the parsed tree. A
 * mousedown on a task box toggles it (one character, undoable); Cmd or Ctrl and a click on a link opens its target in a
 * new tab when it is http:, https: or mailto:.
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
          const at = view.posAtDOM(target) + Number(target.dataset.offset)
          const change = taskToggle(view.state.doc, at)
          if (change !== null) view.dispatch({ changes: change, userEvent: "input" })
          return true
        }
        if (!(event.metaKey || event.ctrlKey) || !(target instanceof Element)) return false
        const href = target.closest<HTMLElement>(".cm-lp-link")?.dataset.href
        if (href === undefined || !isLinkTarget(href)) return false
        window.open(href, "_blank", "noopener,noreferrer")
        return true
      },
    },
  },
)

/** Marks a state that holds the live preview's extension set. */
const LIVE = Facet.define<boolean, boolean>({ combine: (values) => values.length > 0 })

/**
 * The extension set of a live Markdown view: GFM Markdown, the live preview, history with the stock keys and
 * `Mod-Shift-z` as redo, the formatting keys, wrapped lines, no gutters, the accessible name, the file's line separator
 * and the style nonce. It binds no `Mod-s`: saving is the page's.
 */
export function liveExtensions({ name, separator }: { name: string; separator: string }): Extension[] {
  return [
    LIVE.of(true),
    history(),
    formattingKeymap,
    keymap.of([...defaultKeymap, ...historyKeymap]),
    keymap.of([{ key: "Mod-Shift-z", run: redo, preventDefault: true }]),
    markdown({ base: markdownLanguage }),
    livePreview,
    tables,
    tableClick,
    THEME,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ "aria-label": name }),
    EditorState.lineSeparator.of(separator),
    EditorView.cspNonce.of(nonce()),
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
