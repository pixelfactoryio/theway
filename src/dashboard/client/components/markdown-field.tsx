import { EditorState, type Extension, Prec, Transaction } from "@codemirror/state"
import { EditorView, keymap, placeholder as placeholderText } from "@codemirror/view"
import { cn } from "cn"
import { type FocusEvent, useEffect, useLayoutEffect, useMemo, useRef } from "react"

import { LiveMarkdown, liveExtensions } from "@/components/live-markdown"
import { FieldError } from "@/components/ui/field"
import { DraftStore } from "@/drafts/draft-store"

/**
 * A field's text at the interface's scale: the document's styles at `text-sm` (15/22), its headings at 600 and the
 * same size, no measure of its own, on the control's 4px by 8px inset.
 */
const FIELD_SCALE =
  "[--read-width:none] [--text-doc:var(--text-sm)] [--text-doc--line-height:var(--text-sm--line-height)] [--text-doc-h1:var(--text-sm)] [--text-doc-h1--line-height:var(--text-sm--line-height)] [--text-doc-h2:var(--text-sm)] [--text-doc-h2--line-height:var(--text-sm--line-height)] [--text-doc-h3:var(--text-sm)] [--text-doc-h3--line-height:var(--text-sm--line-height)]"

/** A title's text: the document title's size and weight, as the page's title it replaces. */
const TITLE_SCALE =
  "[--read-width:none] [--text-doc:var(--text-doc-title)] [--text-doc--line-height:var(--text-doc-title--line-height)] font-semibold tracking-tight"

/** The control around the editor: an input's outline, 6px corners, the focus ring, red while refused. */
const CONTROL =
  "rounded-md border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 data-[invalid]:border-destructive [&_.cm-content]:px-2! [&_.cm-content]:py-1! [&_.cm-line]:mx-0! [&_.cm-editor]:bg-transparent!"

/** One line: Enter adds nothing, and a line break typed or pasted becomes a space. */
const ONE_LINE: Extension = [
  Prec.highest(keymap.of([{ key: "Enter", run: () => true }])),
  EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || tr.newDoc.lines === 1) return tr
    const text = tr.newDoc.sliceString(0).replace(/\s*[\r\n]+\s*/g, " ")
    return [tr, { changes: { from: 0, to: tr.newDoc.length, insert: text }, sequential: true }]
  }),
]

/**
 * A Markdown text edited where it is read, with the documents' editor (`LiveMarkdown`) and their keys: formatted, its
 * syntax shown on the lines the cursor is on; Ctrl or Cmd and B, I, E, K format, Z undoes, Shift and Z redoes, and
 * Cmd/Ctrl+S, which the editor leaves to the page, saves. Each change is written to the page's draft at once
 * (`onChange`), so the page's footer, Discard and its leave guard cover it as they cover a document; a change the draft
 * refuses shows `error` under it, and the draft keeps its last text. A new `value` (the draft changed by another way)
 * replaces the text. `oneLine` keeps it to one line. Escape (`onLeave`) and moving the focus out (`onBlur`) are the
 * page's: an in-place field closes there.
 */
export function MarkdownField({
  value,
  onChange,
  label,
  oneLine = false,
  scale = "field",
  placeholder,
  autoFocus = false,
  disabled = false,
  error = null,
  onLeave,
  onBlur,
  onFocus,
  className,
}: {
  value: string
  onChange: (value: string) => void
  /** The field's accessible name. */
  label: string
  oneLine?: boolean
  /** The interface's size (`field`), or the page title's (`title`). */
  scale?: "field" | "title"
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
  error?: string | null
  onLeave?: () => void
  onBlur?: () => void
  onFocus?: () => void
  className?: string
}) {
  const latest = useRef(onChange)
  useLayoutEffect(() => {
    latest.current = onChange
  })

  // One store for the field's life: its state holds the live set, so `LiveMarkdown` takes it as it is.
  const store = useMemo(
    () =>
      new DraftStore(
        EditorState.create({
          doc: value,
          extensions: [
            ...liveExtensions({ name: label, separator: "\n" }),
            ...(oneLine ? [ONE_LINE] : []),
            ...(placeholder !== undefined ? [placeholderText(placeholder)] : []),
            EditorState.readOnly.of(disabled),
            EditorView.editable.of(!disabled),
          ],
        }),
      ),
    // The store is made once: a new value reaches it through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Every change of the text is written through; a text set from `value` is not written back.
  const syncing = useRef(false)
  const shown = useRef(value)
  useEffect(
    () =>
      store.subscribe(() => {
        const text = store.state.sliceDoc()
        if (text === shown.current) return
        shown.current = text
        if (!syncing.current) latest.current(text)
      }),
    [store],
  )

  // A value the field did not write (the draft undone, discarded or reloaded) replaces its text, out of its history.
  const written = useRef(value)
  useEffect(() => {
    if (value === written.current) return
    written.current = value
    if (value === store.state.sliceDoc()) return
    syncing.current = true
    try {
      store.dispatch({
        changes: { from: 0, to: store.state.doc.length, insert: value },
        annotations: Transaction.addToHistory.of(false),
      })
    } finally {
      syncing.current = false
    }
  }, [store, value])

  // An opened field takes the focus, the cursor at its end. `LiveMarkdown`'s view is mounted by then (a child's
  // effect runs first).
  useEffect(() => {
    if (!autoFocus) return
    const view = store.view
    if (view === null) return
    view.focus()
    view.dispatch({ selection: { anchor: view.state.doc.length } })
  }, [store, autoFocus])

  const blur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.()
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        data-invalid={error !== null || undefined}
        onBlur={blur}
        onFocus={onFocus}
        // Escape, which the editor leaves alone with nothing to unselect, gives the field back to the page.
        onKeyDown={(event) => {
          if (event.key !== "Escape" || onLeave === undefined || event.defaultPrevented) return
          event.preventDefault()
          onLeave()
        }}
        className={cn(CONTROL, scale === "title" ? TITLE_SCALE : FIELD_SCALE, disabled && "opacity-50", className)}
      >
        <LiveMarkdown store={store} name={label} className="h-auto" />
      </div>
      {error !== null ? <FieldError className="text-xs font-normal">{error}</FieldError> : null}
    </div>
  )
}
