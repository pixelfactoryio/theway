import { CheckIcon, CopyIcon } from "lucide-react"
import { useEffect, useState } from "react"

/** A path in the code font, cut at the start when long, with a Copy button that shows a check for 1.5s after a copy. */
export function CopyPath({ value, name }: { value: string; name: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 flex-1 truncate font-mono text-xs [direction:rtl] text-left" title={value}>
        <bdi>{value}</bdi>
      </span>
      <button
        type="button"
        aria-label={`Copy ${name}`}
        onClick={() =>
          void navigator.clipboard.writeText(value).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
        className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied ? (
          <CheckIcon className="size-3.5" aria-hidden="true" />
        ) : (
          <CopyIcon className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
