import type { ReactNode } from "react"

import { PageHeader } from "@/components/doc-frame"

/** A page's top row: `title` as its `h1`, then `actions` at the right. */
export function TopBar({ title, actions }: { title: string; actions?: ReactNode }) {
  return <PageHeader title={title} actions={actions} />
}

/** The page wrapper below the top row: it never scrolls; the page's `data-scroll-root` element does. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
}
