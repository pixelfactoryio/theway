import { EditorState, type Extension, Prec } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { cn } from "cn"
import { useEffect, useRef } from "react"

import { liveExtensions } from "@/components/live-markdown"
import { lineSeparatorOf } from "@/lib/files"

/** The view's inner room: a page's, the live editor's own gutters; a panel's, 16px on every side. */
const INSET: Record<"page" | "panel", Extension> = {
  page: [],
  panel: Prec.high(EditorView.theme({ ".cm-content": { padding: "1rem" } })),
}

/**
 * A Markdown file, read-only, as the live editor shows it with no line active: formatted, task boxes that cannot be
 * ticked, a link opening in a new tab on a click. A new `text` replaces the whole document, so a preview follows its
 * draft.
 */
export function MarkdownView({
  text,
  name,
  inset = "page",
  className,
}: {
  text: string
  /** The view's accessible name. */
  name: string
  inset?: "page" | "panel"
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef(text)

  // Before the mount below, so a new view takes the current text.
  useEffect(() => {
    latest.current = text
    const v = view.current
    if (v !== null && v.state.doc.toString() !== text)
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } })
  }, [text])

  useEffect(() => {
    if (host.current === null) return
    const doc = latest.current
    const v = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [...liveExtensions({ name, separator: lineSeparatorOf(doc), readOnly: true }), INSET[inset]],
      }),
      parent: host.current,
    })
    view.current = v
    return () => {
      view.current = null
      v.destroy()
    }
  }, [name, inset])

  return <div ref={host} className={cn("h-auto min-h-0", className)} />
}
