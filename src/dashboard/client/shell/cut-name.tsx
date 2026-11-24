import { cn } from "cn"

import { nameTail } from "@/lib/name-tail"

/**
 * A name that, when it does not fit, is cut in the middle: its head ends in an ellipsis and its tail (`nameTail`) stays
 * whole, so `github-com-acme-api` and `github-com-acme-web` still differ when cut. The head never shrinks under 4ch: 3
 * of its characters and the ellipsis.
 */
export function CutName({ name, className }: { name: string; className?: string }) {
  const tail = nameTail(name)
  if (tail === "") return <span className={cn("min-w-0 truncate", className)}>{name}</span>
  return (
    <span className={cn("flex min-w-0", className)}>
      <span className="min-w-[4ch] truncate">{name.slice(0, name.length - tail.length)}</span>
      <span className="shrink-0 whitespace-pre">{tail}</span>
    </span>
  )
}
