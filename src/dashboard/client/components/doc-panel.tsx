import { cn } from "cn"
import { type ReactNode, useState } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { readStored, writeStored } from "@/shell/storage"

/** One tab of a panel pane: its label, an optional count after it, and its content. */
export type PaneTab = { value: string; label: string; count?: ReactNode; content: ReactNode }

/**
 * A pane of the panel, after Conductor's: a row of text tabs over a hairline, the chosen one in the foreground colour
 * and underlined; the chosen one kept in this browser under `remember`.
 */
function Pane({
  tabs,
  remember,
  label,
  className,
}: {
  tabs: PaneTab[]
  remember: string
  label: string
  className?: string
}) {
  const key = `theway-pane:${remember}`
  const [chosen, setChosen] = useState(() => readStored(key))
  const value = tabs.some((t) => t.value === chosen) ? (chosen as string) : (tabs[0]?.value ?? "")
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const v = String(next)
        setChosen(v)
        writeStored(key, v)
      }}
      className={cn("flex min-h-0 flex-col gap-0", className)}
    >
      <TabsList
        variant="line"
        aria-label={label}
        className="h-10 w-full shrink-0 justify-start gap-1 rounded-none border-b bg-transparent px-2 py-0"
      >
        {tabs.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="h-full flex-none gap-2 rounded-none border-0 px-2 text-sm font-normal transition-colors after:inset-x-2! after:bottom-0! after:h-0.5 data-active:text-foreground"
          >
            {t.label}
            {t.count !== undefined ? <span className="text-muted-foreground tabular-nums">{t.count}</span> : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="min-h-0 flex-1 overflow-y-auto">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}

/**
 * A document's side panel, after Conductor's: a header row level with the tab strip (`header`: the status and its
 * action), then a top pane and, when given, a bottom pane, each with its own tabs. `remember` names the kind of page,
 * so each pane reopens on the tab chosen last for that kind.
 */
export function DocPanel({
  header,
  top,
  bottom,
  remember,
  label,
  topShare = "45%",
}: {
  header: ReactNode
  top: PaneTab[]
  bottom?: PaneTab[]
  remember: string
  label: string
  /** The top pane's share of the height when there is a bottom pane. */
  topShare?: "45%" | "70%"
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">{header}</div>
      <Pane
        tabs={top}
        remember={`${remember}:top`}
        label={`${label}: views`}
        className={
          bottom === undefined || bottom.length === 0
            ? "flex-1"
            : topShare === "70%"
              ? "shrink-0 basis-[70%]"
              : "shrink-0 basis-[45%]"
        }
      />
      {bottom !== undefined && bottom.length > 0 ? (
        <Pane tabs={bottom} remember={`${remember}:bottom`} label={`${label}: details`} className="flex-1 border-t" />
      ) : null}
    </div>
  )
}

/** A label and its value, one row of a panel's Details list. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}
