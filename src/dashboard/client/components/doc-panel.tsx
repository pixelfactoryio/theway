import { cn } from "cn"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { type ReactNode, useState } from "react"
import { type LayoutStorage, useDefaultLayout, usePanelRef } from "react-resizable-panels"

import { Button } from "@/components/ui/button"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PANE_TAB } from "@/lib/preferences"
import { readStored, useStored, writeStored } from "@/shell/storage"

/** One tab of a panel pane: its label, an optional count after it, and its content. */
export type PaneTab = { value: string; label: string; count?: ReactNode; content: ReactNode }

/** A pane's tab row: 40px, the height a collapsed bottom pane keeps. */
const TAB_ROW = 40

/** The split's layouts, kept in this browser's storage, which never throws (a private window keeps the default). */
const LAYOUTS: LayoutStorage = { getItem: readStored, setItem: (key, value) => writeStored(key, value) }

/**
 * A pane of the panel, after Conductor's: a row of text tabs over a hairline, the chosen one in the foreground colour
 * and underlined; the chosen one kept in this browser under `remember`. `action` sits at the right of the row; a
 * `collapsed` pane keeps its row and makes its content inert.
 */
function Pane({
  tabs,
  remember,
  label,
  action,
  collapsed = false,
  onChoose,
  className,
}: {
  tabs: PaneTab[]
  remember: string
  label: string
  action?: ReactNode
  collapsed?: boolean
  onChoose?: () => void
  className?: string
}) {
  const key = `theway-pane:${remember}`
  const [chosen, setChosen] = useStored(key, PANE_TAB)
  const value = tabs.some((t) => t.value === chosen) ? (chosen as string) : (tabs[0]?.value ?? "")
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const v = String(next)
        setChosen(v)
        onChoose?.()
      }}
      className={cn("flex min-h-0 flex-col gap-0", className)}
    >
      <div className="flex h-10 shrink-0 items-stretch border-b px-2">
        <TabsList
          variant="line"
          aria-label={label}
          className="h-full min-w-0 flex-1 justify-start gap-1 rounded-none bg-transparent p-0"
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
        {action !== undefined ? <div className="flex shrink-0 items-center">{action}</div> : null}
      </div>
      {tabs.map((t) => (
        <TabsContent
          key={t.value}
          value={t.value}
          inert={collapsed}
          className="relative min-h-0 flex-1 overflow-y-auto"
        >
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}

/** The panel's split: the top pane's default share of the height, as a percentage. */
export type TopShare = `${number}%`

/**
 * The top and bottom panes of a panel, after Conductor's right panel: a vertical split whose 1px separator (a wider hit
 * area, tinted on hover and while dragged, a focus ring) resizes them by pointer or keyboard and resets on double-click.
 * The top pane keeps at least 20% of the height; the bottom one collapses to its tab row, by dragging or by its chevron,
 * and a tab chosen there opens it again. The layout is kept in this browser per kind of panel (`remember`).
 */
function Split({
  top,
  bottom,
  remember,
  label,
  topShare,
}: {
  top: PaneTab[]
  bottom: PaneTab[]
  remember: string
  label: string
  topShare: TopShare
}) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `theway-panel-split:${remember}`,
    storage: LAYOUTS,
  })
  const details = usePanelRef()
  const [collapsed, setCollapsed] = useState(false)
  const toggle = () => {
    const panel = details.current
    if (panel === null) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }
  const bottomName = `${label}: details`
  return (
    <ResizablePanelGroup
      orientation="vertical"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="min-h-0 flex-1"
    >
      <ResizablePanel id="top" defaultSize={topShare} minSize="20%" className="flex min-h-0 flex-col">
        <Pane tabs={top} remember={`${remember}:top`} label={`${label}: views`} className="flex-1" />
      </ResizablePanel>
      <ResizableHandle
        withHandle
        aria-label={`Resize ${bottomName}`}
        // Seen at rest: the line in the input border, its grip in the muted text colour (3:1 or more on both themes).
        className="bg-input [&>div]:bg-muted-foreground transition-colors data-[separator=active]:bg-foreground/60 data-[separator=hover]:bg-foreground/40"
      />
      <ResizablePanel
        id="bottom"
        panelRef={details}
        collapsible
        collapsedSize={TAB_ROW}
        minSize="20%"
        onResize={() => setCollapsed(details.current?.isCollapsed() ?? false)}
        className="flex min-h-0 flex-col"
      >
        <Pane
          tabs={bottom}
          remember={`${remember}:bottom`}
          label={bottomName}
          collapsed={collapsed}
          onChoose={() => {
            if (details.current?.isCollapsed() === true) details.current.expand()
          }}
          className="flex-1"
          action={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-expanded={!collapsed}
              aria-label={collapsed ? `Expand ${bottomName}` : `Collapse ${bottomName}`}
              // A disclosure is expanded by default: no pressed shade for it, the ghost's hover only.
              className="text-muted-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground aria-expanded:hover:bg-muted aria-expanded:hover:text-foreground"
              onClick={toggle}
            >
              {collapsed ? <ChevronUpIcon aria-hidden="true" /> : <ChevronDownIcon aria-hidden="true" />}
            </Button>
          }
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

/**
 * A document's side panel, after Conductor's: a header row level with the tab strip (`header`: the status and its
 * action), then a top pane and, when given, a bottom pane in a resizable split, each with its own tabs. `remember`
 * names the kind of page, so each pane reopens on the tab chosen last and the split on the layout left last for that
 * kind; `topShare` is the top pane's default share (60%).
 */
export function DocPanel({
  header,
  top,
  bottom,
  remember,
  label,
  topShare = "60%",
}: {
  header: ReactNode
  top: PaneTab[]
  bottom?: PaneTab[]
  remember: string
  label: string
  topShare?: TopShare
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">{header}</div>
      {bottom !== undefined && bottom.length > 0 ? (
        <Split top={top} bottom={bottom} remember={remember} label={label} topShare={topShare} />
      ) : (
        <Pane tabs={top} remember={`${remember}:top`} label={`${label}: views`} className="flex-1" />
      )}
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
