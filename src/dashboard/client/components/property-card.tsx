import { cn } from "cn"
import type { ReactNode } from "react"

/**
 * The facts of an item's page, in its panel at the right: small cards stacked 12px apart on the panel's 12px inset,
 * scrolling together. Each card is a `PropertyCard`.
 */
export function PropertyCards({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3", className)}>{children}</div>
}

/**
 * One card of facts: a hairline outline, 8px corners, a soft shadow; a 40px header on the band's tint (its `title` in the ink at 600, `meta` after it
 * in the secondary ink, `action` at the right), then its rows (`PropertyList` of `PropertyRow`s, a `PropertyText`, or
 * a list), each above a light rule.
 */
export function PropertyCard({
  title,
  meta,
  action,
  children,
}: {
  title: ReactNode
  meta?: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="shrink-0 overflow-hidden rounded-lg border bg-card shadow-xs">
      <h3 className="flex h-10 items-center gap-2 bg-band/50 px-3 font-semibold">
        <span className="min-w-0 truncate">{title}</span>
        {meta !== undefined ? <span className="shrink-0 font-normal text-muted-foreground">{meta}</span> : null}
        {action !== undefined ? <span className="ml-auto flex shrink-0 items-center gap-1">{action}</span> : null}
      </h3>
      {children}
    </section>
  )
}

/** A card's key/value rows. */
export function PropertyList({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col">{children}</dl>
}

/**
 * One key/value row of a card: its `label` in the secondary ink in a 100px column, its value in the ink, wrapping;
 * a light rule above it.
 */
export function PropertyRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-2 border-t px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 wrap-break-word">{children}</dd>
    </div>
  )
}

/** A card's free text (a description, a prompt's body): at most 62 characters a line, on a light rule. */
export function PropertyText({ children }: { children: ReactNode }) {
  return <div className="max-w-[62ch] border-t px-3 py-3 text-md">{children}</div>
}
