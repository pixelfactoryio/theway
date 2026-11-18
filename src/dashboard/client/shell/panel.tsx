import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
import { createPortal } from "react-dom"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { PANEL_DOCKED } from "@/lib/preferences"
import { useStored } from "@/shell/storage"

/** The `localStorage` key of the docked panel: hidden (`hidden`, removed when shown). */
const HIDDEN_KEY = "theway-panel"

const WIDE = "(min-width: 1280px)"

/** The docked panel's width in pixels: its least, its most and its first. */
export const PANEL_WIDTH = { min: 320, max: 640, default: 420 } as const

const subscribeWide = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(WIDE)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

/** Whether the window is 1280px wide or wider, where the panel is docked. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches)
}

type PanelState = {
  /** The element a page's panel renders into, `null` until mounted. */
  slot: HTMLElement | null
  setSlot: (slot: HTMLElement | null) => void
  open: boolean
  setOpen: (open: boolean) => void
  /** The name of the panel the page shows, `null` when the page has none. */
  name: string | null
  setName: (name: string | null) => void
}

const PanelContext = createContext<PanelState | null>(null)

/** The panel's state for the shell: docked open as this browser keeps it from 1280px, closed below. */
export function usePanelState(): PanelState {
  const wide = useWide()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [docked, setDocked] = useStored(HIDDEN_KEY, PANEL_DOCKED)
  const [overlay, setOverlay] = useState(false)
  const [name, setName] = useState<string | null>(null)
  const setOpen = useCallback(
    (next: boolean) => {
      if (!wide) {
        setOverlay(next)
        return
      }
      setDocked(next)
    },
    [wide, setDocked],
  )
  return useMemo(
    () => ({ slot, setSlot, open: wide ? docked : overlay, setOpen, name, setName }),
    [slot, wide, docked, overlay, setOpen, name],
  )
}

export const PanelProvider = PanelContext.Provider

function usePanelContext(): PanelState {
  const state = useContext(PanelContext)
  if (state === null) throw new Error("the panel is used outside the shell")
  return state
}

/** The page's panel open state and its setter, shared with the shell. */
export function usePanelOpen(): [boolean, (open: boolean) => void] {
  const { open, setOpen } = usePanelContext()
  return [open, setOpen]
}

/** Whether the shown page has a panel. */
export function usePanelName(): string | null {
  return usePanelContext().name
}

/**
 * The shown page's panel below 1280px: over the page as a sheet. Nothing when the page has none, or from 1280px, where
 * the shell docks it at the right of the page.
 */
export function PanelArea() {
  const { setSlot, open, setOpen, name } = usePanelContext()
  const wide = useWide()
  if (name === null || wide) return null
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-[min(420px,90vw)] gap-0 p-0 sm:max-w-none">
        <SheetHeader className="sr-only">
          <SheetTitle>{name}</SheetTitle>
          <SheetDescription>{name}</SheetDescription>
        </SheetHeader>
        <aside ref={setSlot} aria-label={name} className="flex h-full min-h-0 flex-col" />
      </SheetContent>
    </Sheet>
  )
}

/** Renders `children` into the shell's panel while mounted, naming it `name` for the shell. */
export function PanelPortal({ name, children }: { name: string; children: ReactNode }) {
  const { slot, setName } = usePanelContext()
  useEffect(() => {
    setName(name)
    return () => setName(null)
  }, [name, setName])
  return slot === null ? null : <PortalInto slot={slot}>{children}</PortalInto>
}

function PortalInto({ slot, children }: { slot: HTMLElement; children: ReactNode }) {
  return createPortal(children, slot)
}
