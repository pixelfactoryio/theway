import type { ReactNode } from "react"

import { StateBlock } from "@/shell/state"

/**
 * The one empty state: a line saying a list, a pane or a page has nothing to show, in the secondary ink, with one
 * optional `action`; in red with `tone="error"`. `size="page"` for a page's whole body, `inline` (the default) in a
 * list or a pane.
 */
export function EmptyNote({
  children,
  action,
  tone = "muted",
  size = "inline",
}: {
  children: ReactNode
  action?: ReactNode
  tone?: "muted" | "error"
  size?: "page" | "inline"
}) {
  return (
    <StateBlock size={size} action={action} role={tone === "error" ? "alert" : undefined}>
      {tone === "error" ? <span className="text-destructive-foreground">{children}</span> : children}
    </StateBlock>
  )
}
