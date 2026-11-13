import { cn } from "cn"
import type { ReactNode } from "react"
import { useLocation } from "wouter"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

/** One tab of a record page: a route. */
export type RecordTab = { value: string; label: ReactNode; href: string }

/**
 * The tabs row of a record page: line tabs, each a route, then the page's right part. With `column`, the row sits in
 * the 56rem centred column; the whole row scrolls sideways when its tabs do not fit.
 */
export function RecordTabs({
  column,
  label,
  tabs,
  value,
  right,
}: {
  column: boolean
  label: string
  tabs: RecordTab[]
  value: string
  right?: ReactNode
}) {
  const [, navigate] = useLocation()
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const tab = tabs.find((t) => t.value === next)
        if (tab !== undefined) navigate(tab.href)
      }}
      className="shrink-0 gap-0 overflow-x-auto overflow-y-hidden border-b"
    >
      <div className={cn("flex w-full items-center gap-4 pe-4", column && "mx-auto max-w-4xl")}>
        <TabsList variant="line" aria-label={label} className="flex h-10 justify-start px-2">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-none gap-2 px-2">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {right !== undefined ? <div className="ml-auto flex shrink-0 items-center gap-3">{right}</div> : null}
      </div>
    </Tabs>
  )
}
