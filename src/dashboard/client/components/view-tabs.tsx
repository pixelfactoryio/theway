import type { ReactNode } from "react"
import { Link } from "wouter"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PILL_LIST, PILL_TAB } from "@/components/ui-classes"

/** One view of a page: its label, its address, and a dot while it holds unsaved edits. */
export type ViewTab = { value: string; label: string; href: string; icon?: ReactNode; dirty?: boolean }

/**
 * A page's views, under its header: small pill tabs, each a link to its own address, the chosen one on the blue tint;
 * `actions` at the row's right. The row spans the work area's panel and ends on its hairline, where the page's body
 * (and its docked panel) begins.
 */
export function ViewTabs({
  label,
  value,
  tabs,
  actions,
}: {
  label: string
  value: string
  tabs: readonly ViewTab[]
  actions?: ReactNode
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
      <Tabs value={value} className="min-w-0 flex-1 gap-0">
        <TabsList aria-label={label} className={PILL_LIST}>
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              nativeButton={false}
              render={<Link href={tab.href} />}
              className={PILL_TAB}
            >
              {tab.icon}
              {tab.label}
              {tab.dirty === true ? (
                <span role="img" aria-label="unsaved changes" className="size-1.5 rounded-full bg-foreground" />
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {actions !== undefined ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  )
}
