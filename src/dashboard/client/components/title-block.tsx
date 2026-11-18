import { CheckIcon, CopyIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { EmptyNote } from "@/components/empty-note"
import { StatusMark } from "@/components/status"

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

/** The Problems tab: each error on its own row; one that names a place goes there on click. */
export function Problems({ lines }: { lines: readonly { text: string; onClick: (() => void) | null }[] }) {
  if (lines.length === 0) return <EmptyNote>No problem found.</EmptyNote>
  return (
    <ul className="flex flex-col py-1">
      {lines.map((line, i) => (
        <li key={i}>
          {line.onClick !== null ? (
            <button
              type="button"
              onClick={line.onClick}
              className="flex w-full gap-2 px-4 py-2 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <StatusMark status="invalid" className="mt-2" />
              <span className="min-w-0 flex-1">{line.text}</span>
            </button>
          ) : (
            <div className="flex gap-2 px-4 py-2 text-sm">
              <StatusMark status="invalid" className="mt-2" />
              <span className="min-w-0 flex-1">{line.text}</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
