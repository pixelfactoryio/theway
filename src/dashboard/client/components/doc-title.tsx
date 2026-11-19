import { cn } from "cn"

const H1 = {
  document: "text-title font-semibold tracking-tight text-doc-foreground",
  canvas: "text-title font-semibold tracking-tight",
}

/**
 * A page's title block: a muted caption, the h1, an ID line in mono and a muted description, each when given. Every h1
 * is the interface's one larger size (21/29 at 600): the `document` one (prompt, change) in the document's ink, the
 * `canvas` one the workflow's, its description at most 36rem wide. The wrapper is the caller's.
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
