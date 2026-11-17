import {
  createContext,
  type PointerEvent,
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
import { readStored, writeStored } from "@/shell/storage"

/** The `localStorage` keys of the docked panel: hidden (`hidden`, removed when shown) and its width in pixels. */
const HIDDEN_KEY = "theway-panel"
const WIDTH_KEY = "theway-panel-width"

const WIDE = "(min-width: 1280px)"
const MIN = 320
const MAX = 640
const DEFAULT = 420

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

const readWidth = (): number => {
  const n = Number(readStored(WIDTH_KEY))
  return Number.isFinite(n) && n >= MIN && n <= MAX ? n : DEFAULT
}

/** The panel's state for the shell: docked open as this browser keeps it from 1280px, closed below. */
export function usePanelState(): PanelState {
  const wide = useWide()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [docked, setDocked] = useState(() => readStored(HIDDEN_KEY) !== "hidden")
  const [overlay, setOverlay] = useState(false)
  const [name, setName] = useState<string | null>(null)
  const setOpen = useCallback(
    (next: boolean) => {
      if (!wide) {
        setOverlay(next)
        return
      }
      setDocked(next)
      writeStored(HIDDEN_KEY, next ? null : "hidden")
    },
    [wide],
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
 * The shell's right column: the shown page's panel, docked full height at the right from 1280px (resizable by its left
 * edge, its width kept in this browser), or over the page as a sheet below. Nothing when the page has no panel or it
 * is hidden.
 */
export function PanelArea() {
  const { setSlot, open, setOpen, name } = usePanelContext()
  const wide = useWide()
  const [width, setWidth] = useState(readWidth)

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const start = width
    const move = (e: globalThis.PointerEvent) => setWidth(Math.min(MAX, Math.max(MIN, start + startX - e.clientX)))
    const up = () => {
      removeEventListener("pointermove", move)
      removeEventListener("pointerup", up)
    }
    addEventListener("pointermove", move)
    addEventListener("pointerup", up)
  }

  useEffect(() => {
    writeStored(WIDTH_KEY, String(width))
  }, [width])

  if (name === null) return null
  if (!wide) {
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
  if (!open) return null
  return (
    <aside aria-label={name} style={{ width }} className="relative flex h-svh shrink-0 flex-col border-l bg-sidebar">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${name}`}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setWidth((w) => Math.min(MAX, w + 16))
          if (e.key === "ArrowRight") setWidth((w) => Math.max(MIN, w - 16))
        }}
        className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize outline-none hover:bg-border/60 focus-visible:bg-ring/40"
      />
      <div ref={setSlot} className="flex min-h-0 flex-1 flex-col" />
    </aside>
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
