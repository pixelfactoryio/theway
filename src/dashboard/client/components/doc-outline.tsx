import { EditorView } from "@codemirror/view"
import { cn } from "cn"
import { type ReactNode, useEffect, useRef, useState } from "react"

import type { OutlineEntry } from "@/lib/live-preview"

/** The fewest headings a document has for its outline to show. */
export const OUTLINE_MIN = 3

/** How far under the scroll root's top a heading has to pass to be the current one. */
const CURRENT_LINE = 96

/**
 * A document with its outline: the document in the reading column (its text's measure and gutters), then, while the
 * page has room for both (53rem), its outline at the right of the text, sticky at the top of the document's scroll
 * root. A document with fewer than `OUTLINE_MIN` headings has none, and keeps the column's whole width.
 */
export function OutlinedDoc({
  entries,
  view,
  children,
}: {
  entries: readonly OutlineEntry[]
  /** The document's editor, which a heading's link scrolls. */
  view: () => EditorView | null
  children: ReactNode
}) {
  // One tree whether the outline shows or not: the document's host never remounts as headings come and go.
  const shown = entries.length >= OUTLINE_MIN
  return (
    <div className="@container">
      <div className="flex items-start">
        <div className={cn("min-w-0", shown ? "w-[calc(var(--read-width)+2rem)] max-w-full shrink" : "flex-1")}>
          {children}
        </div>
        {shown ? <DocOutline entries={entries} view={view} /> : null}
      </div>
    </div>
  )
}

/**
 * The outline: "On this page" over the document's headings, each a link that scrolls its heading to the top, indented
 * by its level; the section being read (the last heading past the top of the scroll root, or the last heading once the
 * document is scrolled to its end) is marked in the ink with a bar in the accent.
 */
function DocOutline({ entries, view }: { entries: readonly OutlineEntry[]; view: () => EditorView | null }) {
  const ref = useRef<HTMLElement>(null)
  const [current, setCurrent] = useState<number | null>(entries[0]?.line ?? null)
  const top = Math.min(...entries.map((e) => e.level))

  useEffect(() => {
    const root = ref.current?.closest<HTMLElement>("[data-scroll-root]")
    if (root === null || root === undefined) return
    const update = () => {
      const v = view()
      if (v === null) return
      const edge = root.getBoundingClientRect().top + CURRENT_LINE
      const lines = v.state.doc.lines
      let line = entries[0]?.line ?? null
      for (const e of entries) {
        if (e.line > lines) break
        if (v.documentTop + v.lineBlockAt(v.state.doc.line(e.line).from).top > edge) break
        line = e.line
      }
      if (root.scrollTop > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 2)
        line = entries.at(-1)?.line ?? line
      setCurrent(line)
    }
    update()
    root.addEventListener("scroll", update, { passive: true })
    return () => root.removeEventListener("scroll", update)
  }, [entries, view])

  const go = (entry: OutlineEntry) => {
    const v = view()
    if (v === null || entry.line > v.state.doc.lines) return
    v.dispatch({ effects: EditorView.scrollIntoView(v.state.doc.line(entry.line).from, { y: "start", yMargin: 24 }) })
    setCurrent(entry.line)
  }

  return (
    <nav
      ref={ref}
      aria-label="On this page"
      className="sticky top-0 hidden max-h-screen w-56 shrink-0 overflow-y-auto pt-6 pb-4 pr-4 pl-2 @min-[53rem]:block"
    >
      <p className="mb-2 text-xs font-medium text-muted-foreground">On this page</p>
      <ul className="flex flex-col border-l">
        {entries.map((e) => {
          const here = e.line === current
          return (
            <li key={e.line}>
              <button
                type="button"
                aria-current={here ? "location" : undefined}
                onClick={() => go(e)}
                className={cn(
                  "-ml-px line-clamp-2 w-full border-l-2 border-transparent py-1 pr-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  e.level - top === 0 ? "pl-3" : e.level - top === 1 ? "pl-6" : "pl-9",
                  here && "border-ring font-medium text-foreground",
                )}
              >
                {e.text}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
