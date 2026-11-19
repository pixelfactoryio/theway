import { Fragment, type ReactNode } from "react"

/**
 * A document page's footer bar: the file in mono, each detail after a `·`, and `status` (its save state) at the right.
 */
export function DocFooter({
  file,
  details = [],
  status,
}: {
  file: ReactNode
  details?: readonly ReactNode[]
  status?: ReactNode
}) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-t px-6 text-xs text-muted-foreground">
      <span className="font-mono">{file}</span>
      {details.map((d, i) => (
        <Fragment key={i}>
          <span aria-hidden="true">·</span>
          {d}
        </Fragment>
      ))}
      {status !== undefined ? <span className="ml-auto">{status}</span> : null}
    </div>
  )
}
