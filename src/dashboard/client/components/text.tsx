import { cn } from "cn"
import { CheckIcon, CopyIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { inlineCode } from "@/lib/changes"

/** One line of text, cut with an ellipsis; the full text in a tooltip only while it is cut. */
export function OneLine({ text, className }: { text: string; className?: string }) {
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

  // One stable span for the observer: the tooltip is turned off, not unmounted, while the text fits.
  return (
    <Tooltip disabled={!cut}>
      <TooltipTrigger render={<span ref={ref} className={cn("block min-w-0 truncate", className)} />}>
        {text}
      </TooltipTrigger>
      <TooltipContent className="max-w-md">{text}</TooltipContent>
    </Tooltip>
  )
}

/** A task's text: its backtick spans as code, without the backticks. */
export function TaskText({ text }: { text: string }) {
  return (
    <>
      {inlineCode(text).map((part, i) =>
        part.code ? (
          <code key={i} className="rounded-sm bg-muted px-1 font-mono text-xs">
            {part.text}
          </code>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  )
}

/** A read-only value in the code font with a Copy button; the button shows a check for 1.5s after a copy. */
export function CopyField({ value, name }: { value: string; name: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => {
    void navigator.clipboard.writeText(value).then(
      () => setCopied(true),
      () => setCopied(false)
    )
  }

  return (
    <InputGroup>
      <InputGroupInput readOnly value={value} aria-label={name} className="font-mono" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label={`Copy ${name}`} onClick={copy}>
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
