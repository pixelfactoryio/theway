import type { syntaxTree } from "@codemirror/language"
import type { Text } from "@codemirror/state"

import { isLinkTarget } from "./changes"

/** A Markdown syntax tree, as `syntaxTree` of `@codemirror/language` or the Markdown parser's `parse` gives it. */
type Tree = ReturnType<typeof syntaxTree>
type SyntaxNode = Tree["topNode"]

/** A range of the document. */
export type Span = { from: number; to: number }

/**
 * The style of a whole line: a heading level, a blockquote, a fenced or indented code line (and the first and last
 * lines of its block, which round its corners), a fence, a table row, or a blank line outside code (the space between
 * two blocks, which is shorter than a line of text).
 */
export type LineKind =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "quote" | "code" | "code-start" | "code-end" | "fence" | "table" | "blank"

/**
 * The style of a range within a line: inline formatting, a link's text, a done task's text, an ordered list number, a
 * fence's info string (the block's language label, set at the right off its line).
 */
export type MarkKind = "strong" | "em" | "strike" | "code" | "done" | "number" | "label"

export type LineStyle = { from: number; kind: LineKind }

export type MarkStyle = (Span & { kind: MarkKind }) | (Span & { kind: "link"; href: string })

/**
 * What replaces a range: a bullet for a list marker, a checkbox for a task item's marker and box (`toggle` is the
 * position of the character between its brackets), a rule for a thematic break.
 */
export type Widget =
  | (Span & { kind: "bullet" })
  | (Span & { kind: "checkbox"; checked: boolean; toggle: number; label: string })
  | (Span & { kind: "hr" })

/**
 * A list item's line, indented by its depth (1 for a top-level item): `first`, the line of its marker, hangs the marker
 * in the indent so wrapped text lines up after it; a later line of the item starts at the indent.
 */
export type ItemLine = { from: number; depth: number; first: boolean }

/**
 * The decorations of a live preview: line styles, list item indents, range styles, hidden ranges and widgets, none of
 * which edits the text.
 */
export type Plan = { lines: LineStyle[]; items: ItemLine[]; marks: MarkStyle[]; hidden: Span[]; widgets: Widget[] }

/** The line numbers (from 1) the selection's ranges touch while the editor has focus; none without focus. */
export function activeLines(doc: Text, selection: readonly Span[], focused: boolean): Set<number> {
  const lines = new Set<number>()
  if (!focused) return lines
  for (const r of selection) {
    const last = doc.lineAt(r.to).number
    for (let n = doc.lineAt(r.from).number; n <= last; n++) lines.add(n)
  }
  return lines
}

/** The change that ticks or unticks the task box whose inner character is at `at`: one character, ` ` ↔ `x`. */
export function taskToggle(doc: Text, at: number): { from: number; to: number; insert: string } | null {
  if (at < 1 || at + 2 > doc.length) return null
  const box = doc.sliceString(at - 1, at + 2)
  if (!/^\[[ xX]\]$/.test(box)) return null
  return { from: at, to: at + 1, insert: box[1] === " " ? "x" : " " }
}

const HEADING = /^ATXHeading([1-6])$/

const INLINE: Record<string, { kind: MarkKind; mark: string }> = {
  StrongEmphasis: { kind: "strong", mark: "EmphasisMark" },
  Emphasis: { kind: "em", mark: "EmphasisMark" },
  Strikethrough: { kind: "strike", mark: "StrikethroughMark" },
  InlineCode: { kind: "code", mark: "CodeMark" },
}

/** Nodes left as source, children included: raw HTML; images and autolinks as written. */
const SOURCE = new Set([
  "HTMLBlock",
  "HTMLTag",
  "CommentBlock",
  "Comment",
  "ProcessingInstructionBlock",
  "ProcessingInstruction",
  "Image",
  "Autolink",
])

/** The children of `node` named `name`, in order. */
function children(node: SyntaxNode, name: string): SyntaxNode[] {
  const out: SyntaxNode[] = []
  for (let c = node.firstChild; c !== null; c = c.nextSibling) if (c.name === name) out.push(c)
  return out
}

/**
 * The decorations of the live preview of `doc` for the parts of `tree` within `ranges` (the visible ranges): a syntax
 * mark is hidden, and a list marker, task box or thematic break replaced by a widget, only off the `active` lines; line
 * and range styles apply everywhere. Fenced code keeps its fences; tables and raw HTML stay as source. A blank line
 * outside code is styled as one, active or not, so the space between blocks does not change as the cursor moves.
 */
export function decorationPlan(
  doc: Text,
  tree: Tree,
  active: ReadonlySet<number>,
  ranges: readonly Span[] = [{ from: 0, to: doc.length }],
): Plan {
  const plan: Plan = { lines: [], items: [], marks: [], hidden: [], widgets: [] }
  const seen = new Set<string>()
  const once = (key: string): boolean => {
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }

  // Whether a line from `from` to `to` is active: the syntax shows there.
  const shown = (from: number, to: number): boolean => {
    const last = doc.lineAt(to).number
    for (let n = doc.lineAt(from).number; n <= last; n++) if (active.has(n)) return true
    return false
  }
  // Hides from `from` to `to`, one range per line: a hidden range never holds a line break.
  const hide = (from: number, to: number): void => {
    while (from < to) {
      const line = doc.lineAt(from)
      const end = Math.min(to, line.to)
      if (end > from && once(`h${from}:${end}`)) plan.hidden.push({ from, to: end })
      from = line.to + 1
    }
  }
  const mark = (style: MarkStyle): void => {
    if (style.to > style.from && once(`m${style.kind}${style.from}:${style.to}`)) plan.marks.push(style)
  }
  const widget = (w: Widget): void => {
    if (once(`w${w.from}`)) plan.widgets.push(w)
  }
  // Styles every line of `from`..`to` that lies within `range`.
  const lines = (from: number, to: number, kind: LineKind, range: Span): void => {
    const last = doc.lineAt(Math.min(to, range.to)).number
    for (let n = doc.lineAt(Math.max(from, range.from)).number; n <= last; n++) {
      const at = doc.line(n).from
      if (once(`l${kind}${at}`)) plan.lines.push({ from: at, kind })
    }
  }
  // Styles the lines of code block `node` as code, its first line also as the block's start and its last as its end.
  const block = (node: SyntaxNode, range: Span): void => {
    lines(node.from, node.to, "code", range)
    lines(node.from, node.from, "code-start", range)
    lines(node.to, node.to, "code-end", range)
  }
  // The blanks (spaces and tabs) from `pos` forward, or backward with `step` -1, within the line.
  const blanks = (pos: number, step: 1 | -1): number => {
    const line = doc.lineAt(pos)
    const blank = (from: number): boolean => /^[ \t]$/.test(doc.sliceString(from, from + 1))
    if (step > 0) while (pos < line.to && blank(pos)) pos++
    else while (pos > line.from && blank(pos - 1)) pos--
    return pos
  }

  // Indents the lines of list item `item`: its marker's line hangs the marker, its other text lines start at the
  // indent; off the active lines, the blanks before the marker or the text are hidden, the indent standing for them.
  const indent = (item: SyntaxNode, mark: SyntaxNode): void => {
    let depth = 0
    for (let p = item.parent; p !== null; p = p.parent) if (p.name === "BulletList" || p.name === "OrderedList") depth++
    const first = doc.lineAt(mark.from)
    const at = (line: { from: number; number: number }, start: number, isFirst: boolean): void => {
      if (once(`i${line.from}`)) plan.items.push({ from: line.from, depth, first: isFirst })
      // Only blanks before it: a blockquote's marks are hidden on their own.
      const from = blanks(start, -1)
      if (!active.has(line.number) && from === line.from) hide(from, start)
    }
    at(first, mark.from, true)
    for (let c = item.firstChild; c !== null; c = c.nextSibling) {
      if (c.name !== "Paragraph" && c.name !== "Task") continue
      const last = doc.lineAt(c.to).number
      for (let n = doc.lineAt(c.from).number; n <= last; n++) {
        if (n === first.number) continue
        const line = doc.line(n)
        at(line, blanks(line.from, 1), false)
      }
    }
  }

  const listMark = (node: SyntaxNode): void => {
    const item = node.parent
    if (item !== null) indent(item, node)
    const off = !shown(node.from, node.from)
    const task = item?.getChild("Task") ?? null
    const box = task?.getChild("TaskMarker") ?? null
    if (task !== null && box !== null) {
      const checked = doc.sliceString(box.from + 1, box.from + 2) !== " "
      if (checked) mark({ from: box.to, to: task.to, kind: "done" })
      if (!off) return
      const end = doc.sliceString(box.to, box.to + 1) === " " ? box.to + 1 : box.to
      const text = doc.sliceString(box.to, Math.min(task.to, doc.lineAt(box.to).to)).trim()
      widget({
        kind: "checkbox",
        from: node.from,
        to: end,
        checked,
        toggle: box.from + 1,
        label: `${checked ? "Done" : "To do"}: ${text}`,
      })
      return
    }
    if (item?.parent?.name === "OrderedList") mark({ from: node.from, to: node.to, kind: "number" })
    else if (off) {
      const end = doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to
      widget({ kind: "bullet", from: node.from, to: end })
    }
  }

  const link = (node: SyntaxNode): void => {
    const marks = children(node, "LinkMark")
    const url = node.getChild("URL")
    const [open, close, paren] = marks
    if (open === undefined || close === undefined || paren === undefined || url === null) return
    if (doc.sliceString(close.from, paren.to) !== "](") return
    if (!shown(node.from, node.to)) {
      hide(open.from, open.to)
      hide(close.from, node.to)
    }
    const raw = doc.sliceString(url.from, url.to)
    const href = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw
    if (isLinkTarget(href)) mark({ from: open.to, to: close.from, kind: "link", href })
  }

  for (const range of ranges) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter: (ref) => {
        const node = ref.node
        const name = ref.name
        if (SOURCE.has(name)) return false
        const heading = HEADING.exec(name)
        if (heading !== null) {
          lines(node.from, node.from, `h${heading[1]}` as LineKind, range)
          return undefined
        }
        const inline = INLINE[name]
        if (inline !== undefined) {
          mark({ from: node.from, to: node.to, kind: inline.kind })
          if (!shown(node.from, node.to)) for (const m of children(node, inline.mark)) hide(m.from, m.to)
          return name === "InlineCode" ? false : undefined
        }
        switch (name) {
          case "Table":
            lines(node.from, node.to, "table", range)
            return false
          case "FencedCode": {
            block(node, range)
            for (const m of children(node, "CodeMark")) lines(m.from, m.from, "fence", range)
            const info = node.getChild("CodeInfo")
            if (info !== null && !shown(info.from, info.to)) mark({ from: info.from, to: info.to, kind: "label" })
            return false
          }
          case "CodeBlock":
            block(node, range)
            return false
          case "Blockquote":
            lines(node.from, node.to, "quote", range)
            return undefined
          case "QuoteMark":
            if (!shown(node.from, node.from)) {
              const next = doc.sliceString(node.to, node.to + 1)
              hide(node.from, next === " " ? node.to + 1 : node.to)
            }
            return undefined
          case "HeaderMark":
            if (HEADING.test(node.parent?.name ?? "") && !shown(node.from, node.from)) {
              if (node.prevSibling === null)
                hide(node.from, Math.min(blanks(node.to, 1), node.nextSibling?.from ?? doc.length))
              else hide(blanks(node.from, -1), node.to)
            }
            return undefined
          case "HorizontalRule":
            if (!shown(node.from, node.to)) widget({ kind: "hr", from: node.from, to: node.to })
            return false
          case "ListMark":
            listMark(node)
            return undefined
          case "Link":
            link(node)
            return undefined
          default:
            return undefined
        }
      },
    })
    // The blank lines of the range that no code block holds.
    const last = doc.lineAt(range.to).number
    for (let n = doc.lineAt(range.from).number; n <= last; n++) {
      const line = doc.line(n)
      if (line.text.trim() === "" && !seen.has(`lcode${line.from}`) && once(`lblank${line.from}`))
        plan.lines.push({ from: line.from, kind: "blank" })
    }
  }
  return plan
}

/** A GFM table drawn as a table: its whole lines, its header cells, each column's alignment and its rows' cells. */
export type TableBlock = Span & {
  header: string[]
  align: ("left" | "center" | "right" | null)[]
  rows: string[][]
}

/**
 * The cells of a table's header or row node, cut at the parser's pipes as GFM cuts them: the outer pipes dropped,
 * trimmed, `\|` read as `|`.
 */
function rowCells(doc: Text, row: SyntaxNode): string[] {
  const edges = [row.from, ...children(row, "TableDelimiter").flatMap((p) => [p.from, p.to]), row.to]
  const cells: string[] = []
  for (let i = 0; i + 1 < edges.length; i += 2) {
    cells.push(
      doc
        .sliceString(edges[i] as number, edges[i + 1] as number)
        .trim()
        .replaceAll("\\|", "|"),
    )
  }
  if (row.firstChild?.name === "TableDelimiter") cells.shift()
  if (row.lastChild?.name === "TableDelimiter") cells.pop()
  return cells
}

/** The cells of a delimiter row, which holds only pipes, dashes, colons and spaces: the outer pipes dropped, trimmed. */
const delimiterCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim())

/** A delimiter cell's alignment: `:--` left, `:-:` center, `--:` right, else none. */
const alignOf = (cell: string): TableBlock["align"][number] => {
  const left = cell.startsWith(":")
  const right = cell.endsWith(":")
  return left && right ? "center" : right ? "right" : left ? "left" : null
}

/** The GFM tables of `tree` that no active line touches, each over its whole lines, to draw as tables. */
export function tableBlocks(doc: Text, tree: Tree, active: ReadonlySet<number>): TableBlock[] {
  const blocks: TableBlock[] = []
  tree.iterate({
    enter: (ref) => {
      // Raw HTML and code (whose nested language's tree it would otherwise walk) hold no table.
      if (SOURCE.has(ref.name) || ref.name === "FencedCode" || ref.name === "CodeBlock") return false
      if (ref.name !== "Table") return undefined
      const first = doc.lineAt(ref.from)
      const last = doc.lineAt(Math.max(ref.from, ref.to - 1))
      for (let n = first.number; n <= last.number; n++) if (active.has(n)) return false
      const head = ref.node.getChild("TableHeader")
      const delimiter = ref.node.getChild("TableDelimiter")
      if (head === null || delimiter === null) return false
      blocks.push({
        from: first.from,
        to: last.to,
        header: rowCells(doc, head),
        align: delimiterCells(doc.sliceString(delimiter.from, delimiter.to)).map(alignOf),
        rows: children(ref.node, "TableRow").map((r) => rowCells(doc, r)),
      })
      return false
    },
  })
  return blocks
}

/**
 * The soft line breaks of `tree`'s paragraphs (a task item's text included), to join into one flowing paragraph as
 * CommonMark renders them: each from the end of a paragraph's line to the first character of its text on the next line,
 * so the next line's indentation and blockquote marks are covered too. A hard break (two or more trailing spaces, or a
 * backslash) keeps its line break; headings, code, tables, raw HTML, blank lines and a list item's own first line are no
 * paragraph's soft break. A paragraph one of the `active` lines touches keeps every line break: it shows as written,
 * to be edited.
 */
export function softBreaks(doc: Text, tree: Tree, active: ReadonlySet<number>): Span[] {
  const breaks: Span[] = []
  tree.iterate({
    enter: (ref) => {
      if (SOURCE.has(ref.name) || ref.name === "FencedCode" || ref.name === "CodeBlock" || ref.name === "Table")
        return false
      // A task item's paragraph is its `Task` node.
      if (ref.name !== "Paragraph" && ref.name !== "Task") return undefined
      const first = doc.lineAt(ref.from).number
      const last = doc.lineAt(ref.to).number
      if (last === first) return false
      for (let n = first; n <= last; n++) if (active.has(n)) return false
      // The lines that end in a hard break, and where the paragraph's blockquote marks start.
      const hard = new Set<number>()
      const quotes = new Map<number, number>()
      tree.iterate({
        from: ref.from,
        to: ref.to,
        enter: (c) => {
          if (c.from < ref.from) return undefined
          if (c.name === "HardBreak") hard.add(doc.lineAt(c.from).number)
          else if (c.name === "QuoteMark") quotes.set(c.from, c.to)
          return undefined
        },
      })
      for (let n = first; n < last; n++) {
        if (hard.has(n)) continue
        const next = doc.line(n + 1)
        let to = next.from
        for (;;) {
          while (to < next.to && /^[ \t]$/.test(doc.sliceString(to, to + 1))) to++
          const quote = quotes.get(to)
          if (quote === undefined) break
          to = quote
        }
        breaks.push({ from: doc.line(n).to, to })
      }
      return false
    },
  })
  return breaks
}
