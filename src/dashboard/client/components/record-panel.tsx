import { PanelRightIcon } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { useDefaultLayout } from "react-resizable-panels"

import { Button } from "@/components/ui/button"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** The `localStorage` key of the docked panel's hidden state: `hidden`, removed when shown. */
const PANEL_KEY = "theway-panel"

/** The layout id of the docked panel's width. */
const LAYOUT_ID = "theway-record-panel"

const WIDE = "(min-width: 1024px)"

function readHidden(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) === "hidden"
  } catch {
    return false
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(PANEL_KEY, "hidden")
    else localStorage.removeItem(PANEL_KEY)
  } catch {
    // The state still applies to this page.
  }
}

const subscribeWide = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(WIDE)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

/** Whether the window is 1024px wide or wider, where the panel is docked. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches)
}

/** The page's open state for its panel: the remembered state when docked, closed below 1024px. */
export function usePanelOpen(): [boolean, (open: boolean) => void] {
  return useState(() => window.matchMedia(WIDE).matches && !readHidden())
}

/** The top bar's toggle of a record page's panel: `Hide <x>` or `Show <x>`. */
export function PanelToggle({ x, open, onOpenChange }: { x: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const label = `${open ? "Hide" : "Show"} ${x}`
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon" aria-pressed={open} aria-label={label} onClick={() => onOpenChange(!open)} />
        }
      >
        <PanelRightIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A record page's body: the main area and the panel named `name`. From 1024px the panel is docked at the right,
 * resizable, its width and hidden state remembered; below, it opens over the page as a sheet that starts closed. When
 * the window crosses 1024px, `onOpenChange` gets the new form's state.
 */
export function RecordBody({
  name,
  open,
  onOpenChange,
  panel,
  children,
}: {
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
  panel: ReactNode
  children: ReactNode
}) {
  const wide = useWide()

  const wasWide = useRef(wide)
  useEffect(() => {
    if (wasWide.current === wide) return
    wasWide.current = wide
    onOpenChange(wide ? !readHidden() : false)
  }, [wide, onOpenChange])

  const wasOpen = useRef(open)
  useEffect(() => {
    if (wasOpen.current === open) return
    wasOpen.current = open
    if (wide) writeHidden(!open)
  }, [open, wide])

  if (!wide) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="right" className="gap-0 overflow-y-auto p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>{name}</SheetTitle>
              <SheetDescription>{name}</SheetDescription>
            </SheetHeader>
            <aside aria-label={name} className="pt-8">
              {panel}
            </aside>
          </SheetContent>
        </Sheet>
      </>
    )
  }
  return (
    <DockedBody name={name} open={open} panel={panel}>
      {children}
    </DockedBody>
  )
}

function DockedBody({ name, open, panel, children }: { name: string; open: boolean; panel: ReactNode; children: ReactNode }) {
  const panelIds = open ? ["main", "panel"] : ["main"]
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: LAYOUT_ID, storage: localStorage, panelIds })
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="min-h-0 flex-1"
    >
      <ResizablePanel id="main" minSize="24rem" className="flex min-h-0 flex-col">
        {children}
      </ResizablePanel>
      {open ? (
        <>
          <ResizableHandle aria-label={`Resize ${name}`} />
          <ResizablePanel id="panel" defaultSize="24rem" minSize="20rem" maxSize="40rem">
            <aside aria-label={name} className="h-full overflow-y-auto">
              {panel}
            </aside>
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  )
}
