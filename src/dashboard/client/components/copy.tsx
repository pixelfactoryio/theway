import { Toast } from "@base-ui/react/toast"
import { cn } from "cn"
import { CheckIcon, CopyIcon } from "lucide-react"
import { type RefObject, useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

/** How long a copy control shows its check after a copy, in milliseconds. */
const COPIED_MS = 1500

/**
 * The dashboard's one copy: `copy(value, what)` writes `value` to the clipboard and, once it is written, shows the
 * toast "Copied {what}" with the value; `copied` is true for 1.5s after a copy, for the control that made it. A failed
 * copy is only logged.
 */
export function useCopy(): { copy: (value: string, what: string) => void; copied: boolean } {
  const toasts = Toast.useToastManager()
  const last = useRef<{ value: string; what: string } | null>(null)
  const { isCopied, copyToClipboard } = useCopyToClipboard({
    timeout: COPIED_MS,
    onCopy: () => {
      const done = last.current
      if (done !== null) toasts.add({ title: `Copied ${done.what}`, description: done.value })
    },
  })
  return {
    copy: (value, what) => {
      last.current = { value, what }
      copyToClipboard(value)
    },
    copied: isCopied,
  }
}

/**
 * The icon copy button (ReUI's Icon Copy, `c-button-42`): a 24px ghost icon button in the secondary ink, always seen,
 * named "Copy {what}", its tooltip "Copy {what}" then "Copied" while its check shows. With `triggerRef`, it registers
 * its own copy there while it is mounted (the `C` key's).
 */
export function CopyButton({
  value,
  what,
  className,
  triggerRef,
}: {
  value: string
  /** What is copied, as the toast and the label name it: "the change ID". */
  what: string
  className?: string
  triggerRef?: RefObject<(() => void) | null>
}) {
  const { copy, copied } = useCopy()
  // Again after each render, so the registered copy is this render's.
  useEffect(() => {
    if (triggerRef === undefined) return
    triggerRef.current = () => copy(value, what)
    return () => {
      triggerRef.current = null
    }
  })
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Copy ${what}`}
            onClick={() => copy(value, what)}
            className={cn("shrink-0 text-muted-foreground", className)}
          />
        }
      >
        {copied ? (
          <CheckIcon className="size-3.5" aria-hidden="true" />
        ) : (
          <CopyIcon className="size-3.5" aria-hidden="true" />
        )}
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : `Copy ${what}`}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The event a code block's Copy button (a CodeMirror widget, plain DOM) dispatches, bubbling, with the code as its
 * `detail`: the editor's host copies it (`useCodeCopy`).
 */
export const CODE_COPY_EVENT = "theway-copy-code"

/**
 * Copies the code of a code block of the editor mounted in `host` when its Copy button asks (`CODE_COPY_EVENT`), with
 * the toast "Copied the code". Called once per mounted view, on the element the view is mounted in.
 */
export function useCodeCopy(host: RefObject<HTMLElement | null>): void {
  const { copy } = useCopy()
  // Again after each render, so the listener copies through this render's copy.
  useEffect(() => {
    const element = host.current
    if (element === null) return
    const onCopy = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") copy(event.detail, "the code")
    }
    element.addEventListener(CODE_COPY_EVENT, onCopy)
    return () => element.removeEventListener(CODE_COPY_EVENT, onCopy)
  })
}
