import { EditorView, type Command } from "@codemirror/view"
import { cn } from "cn"
import {
  BoldIcon,
  CodeIcon,
  Heading2Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
} from "lucide-react"
import { type ReactNode, type Ref, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react"

import { EditableCodeView } from "@/components/code-view"
import { DocFooter, LineCount } from "@/components/doc-footer"
import { DocTab } from "@/components/doc-tab"
import { type EditMode, modeHandlers } from "@/components/edit-mode"
import { LiveMarkdown } from "@/components/live-markdown"
import { boldCommand, codeCommand, italicCommand, lineCommand, linkCommand } from "@/components/markdown-editor"
import { HistoryButtons, LAYOUT_PILL, TOOLBAR_ROW, ToolbarButton } from "@/components/toolbar"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { DraftStore } from "@/drafts/draft-store"
import type { FileError } from "@/lib/files"
import { MOD } from "@/shell/platform"

/** A vertical hairline between two groups of a strip, as on the canvas's. */
const GROUP = <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />

/**
 * The editing strip of a Markdown file, between the page's title and the text while editing: the canvas's toolbar
 * strip, `Formatting`. At its left Undo and Redo, then Bold, Italic, Code and Link, Heading, then the three lists; at
 * its right the Live | Source switch. A button keeps the editor's selection and gives it the focus back after its
 * command. Narrower than its buttons (390px), it scrolls sideways inside itself.
 */
function EditingStrip({ store, mode, ref }: { store: DraftStore; mode: EditMode; ref?: Ref<HTMLDivElement> }) {
  const focus = () => store.view?.focus()
  const run = (command: Command) => () => {
    const view = store.view
    if (view === null) return
    command(view)
    view.focus()
  }
  const button = (tip: string, icon: ReactNode, command: Command, keys?: string[]) => (
    <ToolbarButton tip={tip} keys={keys} label={tip} keepFocus onClick={run(command)}>
      {icon}
    </ToolbarButton>
  )
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Formatting"
      className={cn(TOOLBAR_ROW, "overflow-x-auto [scrollbar-width:none]")}
    >
      <HistoryButtons store={store} keepFocus after={focus} />
      {GROUP}
      {button("Bold", <BoldIcon aria-hidden="true" />, boldCommand, [MOD, "B"])}
      {button("Italic", <ItalicIcon aria-hidden="true" />, italicCommand, [MOD, "I"])}
      {button("Code", <CodeIcon aria-hidden="true" />, codeCommand, [MOD, "E"])}
      {button("Link", <LinkIcon aria-hidden="true" />, linkCommand, [MOD, "K"])}
      {GROUP}
      {button("Heading", <Heading2Icon aria-hidden="true" />, lineCommand("heading"))}
      {GROUP}
      {button("Bulleted list", <ListIcon aria-hidden="true" />, lineCommand("bullet"))}
      {button("Numbered list", <ListOrderedIcon aria-hidden="true" />, lineCommand("numbered"))}
      {button("Task list", <ListTodoIcon aria-hidden="true" />, lineCommand("task"))}
      <span className="min-w-2 flex-1" />
      <ToggleGroup
        aria-label="View"
        spacing={2}
        value={[mode.source ? "source" : "live"]}
        onValueChange={(next: string[]) => {
          // Pressing the pressed item empties the value: the current view stays.
          const picked = next[0]
          if (picked === "live" || picked === "source") mode.setSource(picked === "source")
        }}
        className="shrink-0"
      >
        <ToggleGroupItem value="live" className={LAYOUT_PILL}>
          Live
        </ToggleGroupItem>
        <ToggleGroupItem value="source" className={LAYOUT_PILL}>
          Source
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}

/**
 * A Markdown file's view in the page's `mode`, the same on a change's Markdown tabs and a prompt's Prompt view: while
 * reading, the text formatted and read-only (`LiveMarkdown`); while editing, the editing strip over it, the view on the
 * `--muted` tint, Live (the live editor) or Source (the code view of the same draft, in `language`). A double-click on
 * the text enters editing there; Esc while editing is Done. Entering editing while scrolled keeps the text where it
 * stands. Then the footer: the file's name, its line count and the save bar (`saveBar`).
 */
export function DocumentEditor({
  store,
  name,
  language,
  title,
  mode,
  errors,
  file,
  saveBar,
}: {
  store: DraftStore
  /** The editor's accessible name. */
  name: string
  language: "markdown" | "prompt"
  /** The page's title: a first line restating it is hidden off its line. */
  title: string | null
  mode: EditMode
  /** The applied check's errors, marked on their lines in Source. */
  errors: readonly FileError[]
  /** The file's name, in the footer. */
  file: string
  saveBar: ReactNode
}) {
  // A draft's text is always read with the state's line break: `sliceDoc()`.
  const text = useSyncExternalStore(store.subscribe, () => store.getState().sliceDoc())
  const scroll = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const { editing, source } = mode

  // The strip comes in over the scroll root: a scrolled view moves by its height, so the text stays in place.
  useLayoutEffect(() => {
    const root = scroll.current
    if (!editing || root === null || root.scrollTop <= 0) return
    root.scrollTop += strip.current?.offsetHeight ?? 0
  }, [editing])

  // Live and Source: the other view takes the focus with the cursor's line in view (after its own mount).
  const shownSource = useRef(source)
  useEffect(() => {
    if (shownSource.current === source) return
    shownSource.current = source
    const view = store.view
    if (view === null || !editing) return
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "center" }) })
    view.focus()
  }, [store, source, editing])

  const handlers = modeHandlers(mode)
  const footer = <DocFooter file={file} details={[<LineCount text={text} />]} status={saveBar} />
  return (
    <>
      {editing ? <EditingStrip ref={strip} store={store} mode={mode} /> : null}
      {source ? (
        <>
          <div className="min-h-0 flex-1" {...handlers}>
            <EditableCodeView key={name} draft={store} errors={errors} editing={editing} source={{ language, name }} />
          </div>
          {footer}
        </>
      ) : (
        <DocTab footer={footer} scrollRef={scroll} className={cn(editing && "bg-muted")} {...handlers}>
          <LiveMarkdown key={name} store={store} name={name} title={title} editing={editing} className="h-auto" />
        </DocTab>
      )}
    </>
  )
}
