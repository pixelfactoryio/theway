import type { ReactNode } from "react"

import { PageHeader } from "@/components/doc-frame"

/** Where the page sits: a link, a section's name, or the current page (the last item, its title). */
export type TopBarItem = { label: string; href: string } | { section: string } | { label: string }

/** A page's top row: the last item's label as its `h1`, then `actions` at the right. */
export function TopBar({ items, actions }: { items: TopBarItem[]; actions?: ReactNode }) {
  const last = items.at(-1)
  const title = last !== undefined && "label" in last ? last.label : ""
  return <PageHeader title={title} actions={actions} />
}

/** The page wrapper below the top row: it never scrolls; the page's `data-scroll-root` element does. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
}
