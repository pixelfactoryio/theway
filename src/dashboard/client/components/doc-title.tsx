import { cn } from "cn"
import { createContext, type ReactNode, useContext } from "react"

import { DOC_COLUMN, PROSE_COLUMN } from "@/components/doc-frame"

/** Where a title block stands: on the gutter, or in the document column under `ColumnTitle`. */
const TitlePlace = createContext<"gutter" | "column">("gutter")

/**
 * A page's title block: a muted caption, the h1, an ID line in mono and a muted description, each when given. Every h1
 * is the interface's one larger size (21/29 at 600). On the gutter (a workflow's canvas, a code tab, a History tab) it
 * is the same on every page: the h1 in the interface's ink, the description at most 36rem wide. In the document column
 * the h1 takes the document's ink and the description the column's width.
 */
export function DocTitle({
  caption,
  title,
  id,
  description,
}: {
  caption?: string
  title: string
  id?: string
  description?: string | null
}) {
  const column = useContext(TitlePlace) === "column"
  return (
    <>
      {caption !== undefined ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
      {/* Not merged by `cn`: it reads `text-title` (a size) and `text-doc-foreground` (a colour) as one group. */}
      <h1
        className={`${caption !== undefined ? "mt-1 " : ""}text-title font-semibold tracking-tight ${column ? "text-doc-foreground" : "text-foreground"}`}
      >
        {title}
      </h1>
      {id !== undefined ? <p className="mt-2 font-mono text-sm text-muted-foreground">{id}</p> : null}
      {description != null ? (
        <p className={cn("text-sm text-muted-foreground", !column && "max-w-xl")}>{description}</p>
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
      <div className={PROSE_COLUMN}>
        <TitlePlace.Provider value="column">{children}</TitlePlace.Provider>
      </div>
    </div>
  )
}

/**
 * A document tab, the same on every page that shows a file as a document (a change's files, an archived change, a
 * prompt's Preview): the page's notices, then the scroll root that holds the title in the document column
 * (`ColumnTitle`) and the document under it, then the footer.
 */
export function DocTab({
  title,
  notices,
  footer,
  children,
}: {
  /** The page's title block, as it passes it: a `DocTitle` or a `ChangeHeading`. */
  title: ReactNode
  /** The strips over the document: a conflict, a failed save, the errors. */
  notices?: ReactNode
  footer: ReactNode
  /** The document. */
  children: ReactNode
}) {
  return (
    <>
      {notices}
      <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
        <ColumnTitle>{title}</ColumnTitle>
        {children}
      </div>
      {footer}
    </>
  )
}
