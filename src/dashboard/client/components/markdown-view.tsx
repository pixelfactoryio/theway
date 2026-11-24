import { markdownLanguage } from "@codemirror/lang-markdown"
import { EditorState, type Extension, Prec, Text } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { cn } from "cn"
import { useCallback, useEffect, useMemo, useRef } from "react"

import { useCodeCopy } from "@/components/copy"
import { OutlinedDoc } from "@/components/doc-outline"
import { liveExtensions, setTitle } from "@/components/live-markdown"
import { lineSeparatorOf } from "@/lib/files"
import { outlineOf } from "@/lib/live-preview"

/** The view's inner room: a page's, the live editor's own gutters; a panel's, 16px on every side. */
const INSET: Record<"page" | "panel", Extension> = {
  page: [],
  panel: Prec.high(EditorView.theme({ ".cm-content": { padding: "1rem" } })),
}

/**
 * A Markdown file, read-only, as the live editor shows it with no line active: formatted, task boxes that cannot be
 * ticked, a link opening in a new tab on a click; a first line that restates the page's `title` is left out. On a page
 * (`inset` `page`), its outline stands at its right while the page has room (`OutlinedDoc`). A new `text` replaces the
 * whole document, so a preview follows its draft.
 */
export function MarkdownView({
  text,
  name,
  title = null,
  inset = "page",
  className,
}: {
  text: string
  /** The view's accessible name. */
  name: string
  /** The page's title (`ItemHeading`'s), `null` when the page states none. */
  title?: string | null
  inset?: "page" | "panel"
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef(text)
  const latestTitle = useRef(title)
  useCodeCopy(host)

  // Before the mount below, so a new view takes the current text.
  useEffect(() => {
    latest.current = text
    const v = view.current
    if (v !== null && v.state.doc.toString() !== text)
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } })
  }, [text])

  useEffect(() => {
    latestTitle.current = title
    view.current?.dispatch({ effects: setTitle.of(title) })
  }, [title])

  useEffect(() => {
    if (host.current === null) return
    const doc = latest.current
    const v = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [
          ...liveExtensions({ name, separator: lineSeparatorOf(doc), readOnly: true, title: latestTitle.current }),
          INSET[inset],
        ],
      }),
      parent: host.current,
    })
    view.current = v
    return () => {
      view.current = null
      v.destroy()
    }
  }, [name, inset])

  const outline = useMemo(() => {
    if (inset !== "page") return []
    const doc = Text.of(text.split(/\r\n?|\n/))
    return outlineOf(doc, markdownLanguage.parser.parse(doc.toString()), title)
  }, [text, title, inset])
  const current = useCallback(() => view.current, [])

  return (
    <OutlinedDoc entries={outline} view={current}>
      <div ref={host} className={cn("h-auto min-h-0", className)} />
    </OutlinedDoc>
  )
}
