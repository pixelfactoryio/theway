import { EditorSelection, type EditorState, Prec } from "@codemirror/state"
import { type Command, EditorView, keymap } from "@codemirror/view"
import {
  BoldIcon,
  CodeIcon,
  HeadingIcon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
} from "lucide-react"
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"

import { DraftStore, EditableCodeView } from "@/components/code-view"
import { MarkdownView } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { FileError } from "@/lib/files"
import { blockAt, type LinePrefix, linked, prefixed, type Replace, shortcutTip, wrapped } from "@/lib/change-edit"

/** A Replace computed on the text around the selection, then placed in the document. */
function replaceAround(state: EditorState, from: number, to: number, margin: number, f: (text: string, from: number, to: number) => Replace) {
  const start = Math.max(0, from - margin)
  const end = Math.min(state.doc.length, to + margin)
  const r = f(state.doc.sliceString(start, end), from - start, to - start)
  return {
    changes: { from: r.from + start, to: r.to + start, insert: r.insert },
    range: EditorSelection.range(r.anchor + start, r.head + start),
  }
}

/** Bold, Italic or Code: wraps each selection in `marker`, or unwraps it. */
const wrapCommand =
  (marker: string): Command =>
  (view) => {
    const state = view.state
    view.dispatch(
      state.changeByRange((range) => replaceAround(state, range.from, range.to, marker.length, (t, f, e) => wrapped(t, f, e, marker))),
      { scrollIntoView: true, userEvent: "input" }
    )
    return true
  }

/** Link: `[text](https://)` around each selection, the link text selected. */
const linkCommand: Command = (view) => {
  const state = view.state
  view.dispatch(
    state.changeByRange((range) => replaceAround(state, range.from, range.to, 0, linked)),
    { scrollIntoView: true, userEvent: "input" }
  )
  return true
}

/** Heading, Bulleted list, Numbered list or Task list: the prefix toggled on every selected line. */
const prefixCommand =
  (kind: LinePrefix): Command =>
  (view) => {
    const state = view.state
    const numbers: number[] = []
    for (const range of state.selection.ranges) {
      const first = state.doc.lineAt(range.from).number
      const last = state.doc.lineAt(range.to).number
      for (let n = first; n <= last; n++) if (!numbers.includes(n)) numbers.push(n)
    }
    numbers.sort((a, b) => a - b)
    const lines = numbers.map((n) => state.doc.line(n))
    const next = prefixed(
      lines.map((l) => l.text),
      kind
    )
    view.dispatch({
      changes: lines.map((l, i) => ({ from: l.from, to: l.to, insert: next[i] as string })),
      scrollIntoView: true,
      userEvent: "input",
    })
    return true
  }

const BOLD = wrapCommand("**")
const ITALIC = wrapCommand("_")
const CODE = wrapCommand("`")

/**
 * The formatting shortcuts of a Markdown draft, ahead of the default keymap: Mod-B, Mod-I, Mod-E and Mod-K; the key
 * event goes no further (Ctrl or Cmd and B in the source does not toggle the sidebar).
 */
export const formattingKeymap = Prec.highest(
  keymap.of(
    (
      [
        ["Mod-b", BOLD],
        ["Mod-i", ITALIC],
        ["Mod-e", CODE],
        ["Mod-k", linkCommand],
      ] as const
    ).map(([key, run]) => ({ key, run, preventDefault: true, stopPropagation: true }))
  )
)

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

type Tool = { label: string; icon: ReactNode; run: Command; key?: string }

const GROUPS: Tool[][] = [
  [
    { label: "Bold", icon: <BoldIcon aria-hidden="true" />, run: BOLD, key: "B" },
    { label: "Italic", icon: <ItalicIcon aria-hidden="true" />, run: ITALIC, key: "I" },
    { label: "Code", icon: <CodeIcon aria-hidden="true" />, run: CODE, key: "E" },
    { label: "Link", icon: <LinkIcon aria-hidden="true" />, run: linkCommand, key: "K" },
  ],
  [{ label: "Heading", icon: <HeadingIcon aria-hidden="true" />, run: prefixCommand("heading") }],
  [
    { label: "Bulleted list", icon: <ListIcon aria-hidden="true" />, run: prefixCommand("bullet") },
    { label: "Numbered list", icon: <ListOrderedIcon aria-hidden="true" />, run: prefixCommand("numbered") },
    { label: "Task list", icon: <ListChecksIcon aria-hidden="true" />, run: prefixCommand("task") },
  ],
]

/** The toolbar over the source: ghost icon buttons with tooltips; pressing one keeps the focus in the editor. */
function Toolbar({ store }: { store: DraftStore }) {
  return (
    <div role="toolbar" aria-label="Formatting" className="flex items-center gap-1 border-b px-2 py-1">
      {GROUPS.map((group, g) => (
        <Fragment key={g}>
          {g > 0 ? <Separator orientation="vertical" className="mx-1 data-vertical:h-4 data-vertical:self-center" /> : null}
          {group.map((tool) => (
            <Tooltip key={tool.label}>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={tool.label}
                    aria-keyshortcuts={tool.key === undefined ? undefined : `${MAC ? "Meta" : "Control"}+${tool.key}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const view = store.view
                      if (view === null) return
                      tool.run(view)
                      view.focus()
                    }}
                  />
                }
              >
                {tool.icon}
              </TooltipTrigger>
              <TooltipContent>{tool.key === undefined ? tool.label : shortcutTip(tool.label, tool.key, MAC)}</TooltipContent>
            </Tooltip>
          ))}
        </Fragment>
      ))}
    </div>
  )
}

/** The cursor's line (from 1) of a state. */
const cursorLine = (state: EditorState): number => state.doc.lineAt(state.selection.main.head).number

/** The preview of the draft: member 02's Markdown view, its checkboxes disabled, kept on the block of the cursor's line. */
function Preview({ store, name }: { store: DraftStore; name: string }) {
  const pane = useRef<HTMLDivElement>(null)
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const text = state.sliceDoc()
  const line = cursorLine(state)

  // The block that holds the cursor's line, 16px under the pane's top edge.
  useLayoutEffect(() => {
    const p = pane.current
    if (p === null) return
    const blocks = [...p.querySelectorAll<HTMLElement>("[data-line]")]
    const i = blockAt(
      blocks.map((b) => Number(b.dataset.line)),
      line
    )
    const block = blocks[i]
    if (block === undefined) return
    p.scrollTop += block.getBoundingClientRect().top - p.getBoundingClientRect().top - 16
  }, [line, text])

  return (
    <div
      ref={pane}
      role="region"
      aria-label={`Preview of ${name}`}
      className="h-full overflow-y-auto px-6 py-6"
      onClick={(event) => {
        const block = (event.target as HTMLElement).closest<HTMLElement>("[data-line]")
        const view = store.view
        if (block === null || view === null) return
        const n = Number(block.dataset.line)
        if (!(n >= 1 && n <= view.state.doc.lines)) return
        const from = view.state.doc.line(n).from
        view.dispatch({ selection: EditorSelection.cursor(from), effects: EditorView.scrollIntoView(from, { y: "start" }) })
        view.focus()
      }}
    >
      <MarkdownView text={text} />
    </div>
  )
}

/** Markdown has no check: one empty list, so the code view marks nothing and dispatches no marks again. */
const NO_ERRORS: readonly FileError[] = []

/** The source: the toolbar, then the editable code view. */
function Source({ store }: { store: DraftStore }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar store={store} />
      <div className="min-h-0 flex-1">
        <EditableCodeView draft={store} errors={NO_ERRORS} />
      </div>
    </div>
  )
}

/** The main area's width is 900px or more: the source and the preview side by side. */
function useWideArea(node: HTMLElement | null): boolean {
  const [wide, setWide] = useState(true)
  useLayoutEffect(() => {
    if (node === null) return
    const measure = () => setWide(node.getBoundingClientRect().width >= 900)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return wide
}

/**
 * The editing view of a Markdown file: the source beside its live preview, half each, or Write and Preview tabs when
 * the main area is narrower than 900px. It opens with the cursor on `startLine`.
 */
export function MarkdownEditor({ store, name, startLine }: { store: DraftStore; name: string; startLine: number }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const wide = useWideArea(host)
  const [pane, setPane] = useState<"write" | "preview">("write")

  // The place kept on entering: the cursor on the source line of the block at the top of the reading view.
  const placed = useRef(false)
  useEffect(() => {
    const view = store.view
    if (placed.current || view === null) return
    placed.current = true
    const n = Math.min(Math.max(1, startLine), view.state.doc.lines)
    const from = view.state.doc.line(n).from
    view.dispatch({ selection: EditorSelection.cursor(from), effects: EditorView.scrollIntoView(from, { y: "start" }) })
  })

  return (
    <div ref={setHost} className="flex min-h-0 flex-1 flex-col">
      {wide ? (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel id="source" defaultSize="50%" minSize="25%" className="min-h-0">
            <Source store={store} />
          </ResizablePanel>
          <ResizableHandle aria-label="Resize the source and the preview" />
          <ResizablePanel id="preview" defaultSize="50%" minSize="25%" className="min-h-0">
            <Preview store={store} name={name} />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <Tabs value={pane} onValueChange={(v) => setPane(v === "preview" ? "preview" : "write")} className="min-h-0 flex-1 gap-0">
          <TabsList variant="line" aria-label="Write or preview" className="h-10 px-2">
            <TabsTrigger value="write" className="px-2">
              Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="px-2">
              Preview
            </TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 border-t">{pane === "write" ? <Source store={store} /> : <Preview store={store} name={name} />}</div>
        </Tabs>
      )}
    </div>
  )
}
