import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { addressOf, ScrollMemory } from "@/lib/scroll"

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
 * no query is fetching, and starts it at 0 on any other navigation.
 */
export function useScrollMemory(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    let frame = 0
    let reset = false
    let hash = location.hash
    // The router re-renders on `hashchange`, which the browser queues after `popstate`: until it fires, the mounted
    // scroll root is still the previous page's.
    let awaitingHashchange = false

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
      if (pending === null || awaitingHashchange || pending.address !== address()) return
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
    const onPopstate = () => {
      memory.navigate(address(), true)
      reset = false
      awaitingHashchange = location.hash !== hash
      hash = location.hash
      schedule()
    }
    const onHashchange = () => {
      hash = location.hash
      // Back and Forward fire `popstate` first; its restore is pending for this address and waits for this event.
      if (memory.pending !== null && memory.pending.address === address()) {
        awaitingHashchange = false
        schedule()
        return
      }
      awaitingHashchange = false
      memory.navigate(address(), false)
      reset = true
      schedule()
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    const unsubscribe = queryClient.getQueryCache().subscribe(schedule)
    document.addEventListener("scroll", onScroll, true)
    window.addEventListener("popstate", onPopstate)
    window.addEventListener("hashchange", onHashchange)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      observer.disconnect()
      unsubscribe()
      document.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("popstate", onPopstate)
      window.removeEventListener("hashchange", onHashchange)
    }
  }, [queryClient])
}
