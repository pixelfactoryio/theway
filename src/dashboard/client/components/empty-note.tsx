import { cn } from "cn"
import type { ReactNode } from "react"

/**
 * A line saying a list or a page has nothing to show, muted, or in red with `tone="error"`. Its gutters are a panel's
 * (16px), or a workspace page's (24px) with `inset="page"`.
 */
export function EmptyNote({
  children,
  tone = "muted",
  inset = "panel",
}: {
  children: ReactNode
  tone?: "muted" | "error"
  inset?: "panel" | "page"
}) {
  return (
    <p
      className={cn(
        "py-3 text-sm",
        inset === "page" ? "px-6" : "px-4",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {children}
    </p>
  )
}
