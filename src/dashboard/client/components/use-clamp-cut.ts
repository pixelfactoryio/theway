import { useLayoutEffect, useState } from "react"

/**
 * Whether a clamped text's element cuts it (its content taller than its clamp), measured once it is drawn and again as
 * its size changes; `text` is the clamped text, `null` while it shows whole. The callback ref it gives goes on the
 * clamped element.
 */
export function useClampCut(text: string | null): readonly [(node: HTMLElement | null) => void, boolean] {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    if (node === null || text === null) return
    const measure = () => setCut(node.scrollHeight > node.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, text])
  return [setNode, text !== null && cut] as const
}
