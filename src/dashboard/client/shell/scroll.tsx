import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { addressOf, ScrollMemory } from "@/lib/scroll"
import { onAccept } from "@/shell/guard"

const memory = new ScrollMemory()

const address = (): string => addressOf(location.search, location.hash)

/** The page's scroll root: the first scroll-area viewport inside its `data-scroll-root` element, else that element. */
function scrollRoot(): HTMLElement | null {
  const marked = document.querySelector<HTMLElement>("[data-scroll-root]")
  if (marked === null) return null
  return marked.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? marked
}

/**
 * Keeps the scroll root's offset per address as it scrolls, puts it back on Back and Forward once the root exists and
 * no query is fetching, and starts it at 0 on any other navigation; both as the router takes the new address.
 */
export function useScrollMemory(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    let frame = 0
    let reset = false

    const settle = () => {
      frame = 0
      const root = scrollRoot()
      if (reset) {
        if (root === null) return
        root.scrollTop = 0
        reset = false
        return
      }
      const pending = memory.pending
      if (pending === null || pending.address !== address()) return
      if (root === null || queryClient.isFetching() > 0) return
      root.scrollTop = pending.top
      memory.pending = null
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(settle)
    }

    const onScroll = (event: Event) => {
      const root = scrollRoot()
      if (root === null || event.target !== root || memory.pending !== null || reset) return
      memory.save(address(), root.scrollTop)
    }
    // The router takes each new address before it renders it: Back and Forward (with or without a search part) make
    // the restore of that address pending, any other navigation starts at 0.
    const onAddress = (traversal: boolean) => {
      memory.navigate(address(), traversal)
      reset = !traversal
      schedule()
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    const unsubscribe = queryClient.getQueryCache().subscribe(schedule)
    const stop = onAccept(onAddress)
    document.addEventListener("scroll", onScroll, true)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      observer.disconnect()
      unsubscribe()
      stop()
      document.removeEventListener("scroll", onScroll, true)
    }
  }, [queryClient])
}
