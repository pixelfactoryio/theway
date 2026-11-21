import { cn } from "cn"
import { useEffect, useRef, useState, type RefObject } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { inlineCode } from "@/lib/changes"

/** Whether the text of the returned ref's span is wider than the span shows, measured again on each resize. */
function useCut(text: string): [RefObject<HTMLSpanElement | null>, boolean] {
  const ref = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (node === null) return
    const measure = () => setCut(node.scrollWidth > node.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [text])

  return [ref, cut]
}

/** One line of text, cut with an ellipsis; the full text in a tooltip only while it is cut. */
export function OneLine({
  text,
  className,
  tooltipClassName = "max-w-md",
}: {
  text: string
  className?: string
  tooltipClassName?: string
}) {
  const [ref, cut] = useCut(text)

  // One stable span for the observer: the tooltip is turned off, not unmounted, while the text fits.
  return (
    <Tooltip disabled={!cut}>
      <TooltipTrigger render={<span ref={ref} className={cn("block min-w-0 truncate", className)} />}>
        {text}
      </TooltipTrigger>
      <TooltipContent className={tooltipClassName}>{text}</TooltipContent>
    </Tooltip>
  )
}

/** A task's text: its backtick spans as code, without the backticks. */
export function TaskText({ text }: { text: string }) {
  return (
    <>
      {inlineCode(text).map((part, i) =>
        part.code ? (
          <code key={i} className="rounded-sm bg-muted px-1 font-mono text-xs wrap-anywhere">
            {part.text}
          </code>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  )
}
