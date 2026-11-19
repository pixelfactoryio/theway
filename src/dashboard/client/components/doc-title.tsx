import { cn } from "cn"
import type { ReactNode } from "react"

import { DOC_COLUMN, PROSE_COLUMN } from "@/components/doc-frame"

const H1 = {
  document: "text-title font-semibold tracking-tight text-doc-foreground",
  canvas: "text-title font-semibold tracking-tight",
}

/**
 * A page's title block: a muted caption, the h1, an ID line in mono and a muted description, each when given. Every h1
 * is the interface's one larger size (21/29 at 600): the `document` one (prompt, change) in the document's ink, the
 * `canvas` one the workflow's, its description at most 36rem wide. It stands in one of the two wrappers below.
 */
export function DocTitle({
  caption,
  title,
  id,
  description,
  variant,
}: {
  caption?: string
  title: string
  id?: string
  description?: string | null
  variant: "document" | "canvas"
}) {
  return (
    <>
      {caption !== undefined ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
      {/* Not merged by `cn`: it reads `text-title` (a size) and `text-doc-foreground` (a colour) as one group. */}
      <h1 className={`${caption !== undefined ? "mt-1 " : ""}${H1[variant]}`}>{title}</h1>
      {id !== undefined ? <p className="mt-2 font-mono text-sm text-muted-foreground">{id}</p> : null}
      {description != null ? (
        <p className={cn("text-sm text-muted-foreground", variant === "canvas" && "max-w-xl")}>{description}</p>
      ) : null}
    </>
  )
}

/**
 * A title block on the 24px gutter, 16px under the top row and 12px over what follows, which never scrolls: above a
 * file's code (`CodeTab`), a file's history (`HistoryTab`) and a workflow that cannot be drawn. With `rule`, a 1px
 * rule closes it.
 */
export function GutterTitle({ rule = false, children }: { rule?: boolean; children: ReactNode }) {
  return <div className={cn("shrink-0 px-6 pt-4 pb-3", rule && "border-b")}>{children}</div>
}

/**
 * A title block in the document column, the title of the document below it: no wider than prose, 40px under the top
 * row, inside the page's scroll root so it scrolls with the document, which gives the 24px under it. Above every
 * Markdown view: a change's files, an archived change, a prompt's Preview.
 */
export function ColumnTitle({ children }: { children: ReactNode }) {
  return (
    <div className={cn("pt-10", DOC_COLUMN)}>
      <div className={PROSE_COLUMN}>{children}</div>
    </div>
  )
}
