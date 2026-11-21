import { cn } from "cn"
import { CircleAlertIcon, InfoIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"

/**
 * The one shape of every state a page or a panel shows in place of its content (nothing to show, nothing found, a
 * failed load): left-aligned on the panel's 16px gutter, an optional 16px `icon`, a `title` in the ink at 500, the
 * `children` in the secondary ink, at most 60 characters a line, and one optional `action` under them. `size="page"`
 * stands 24px under what is above it (a page's whole body), `inline` 12px (a list, a pane). `role` makes it an alert
 * or a status for assistive technology.
 */
export function StateBlock({
  icon,
  title,
  children,
  action,
  size = "inline",
  role,
  className,
}: {
  icon?: ReactNode
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  size?: "page" | "inline"
  role?: "alert" | "status" | "note"
  className?: string
}) {
  return (
    <div
      data-slot="state"
      role={role}
      className={cn("flex items-start gap-3 px-4", size === "page" ? "pt-6 pb-3" : "py-3", className)}
    >
      {icon !== undefined ? <span className="flex h-4.5 shrink-0 items-center [&_svg]:size-4">{icon}</span> : null}
      <div className="flex max-w-[60ch] min-w-0 flex-col items-start gap-1">
        {title !== undefined ? <p className="font-medium text-foreground">{title}</p> : null}
        {children !== undefined ? <div className="text-muted-foreground">{children}</div> : null}
        {action !== undefined ? <div className="mt-2 flex items-center gap-2">{action}</div> : null}
      </div>
    </div>
  )
}

/** How long a load runs before `StateLoading` shows: a quicker one shows nothing, so it never flashes. */
const LOADING_DELAY = 400

/**
 * A load still running, in the one state shape: nothing for its first 400ms, then a turning ring in the secondary
 * ink and `children` (`Loading…` by default), announced as a status.
 */
export function StateLoading({
  children = "Loading…",
  size = "inline",
}: {
  children?: ReactNode
  size?: "page" | "inline"
}) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), LOADING_DELAY)
    return () => clearTimeout(timer)
  }, [])
  if (!shown) return null
  return (
    <StateBlock
      role="status"
      size={size}
      icon={<LoaderCircleIcon aria-hidden="true" className="text-muted-foreground motion-safe:animate-spin" />}
    >
      {children}
    </StateBlock>
  )
}

/** A notice's tone: its icon's colour, and the icon it takes when it is given none. */
const NOTICE_TONE = {
  error: { className: "text-destructive", Icon: CircleAlertIcon },
  warning: { className: "text-warning", Icon: TriangleAlertIcon },
  info: { className: "text-muted-foreground", Icon: InfoIcon },
} as const

/**
 * A notice about what a page shows (its errors, a conflict, a failed save, an action that failed), in the one state
 * shape laid on its side: the tone's 16px icon, a `title` in the ink at 500, the `children` in the secondary ink, and
 * `action` at the right; no tinted box. `place` sets its edges: `strip`, the page's width under its views on the 16px
 * gutter with a hairline under it; `card`, a card's row on its 12px gutter above a light rule; `bare`, no edge nor
 * gutter (under a title). Announced as an alert, an `info` notice as a status.
 */
export function StateNotice({
  tone,
  icon,
  title,
  children,
  action,
  place = "strip",
  className,
}: {
  tone: keyof typeof NOTICE_TONE
  icon?: ReactNode
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  place?: "strip" | "card" | "bare"
  className?: string
}) {
  const { className: ink, Icon } = NOTICE_TONE[tone]
  return (
    <div
      data-slot="notice"
      role={tone === "info" ? "status" : "alert"}
      className={cn(
        "flex items-start gap-3",
        place === "strip" && "shrink-0 border-b px-4 py-3",
        place === "card" && "border-t border-rule px-3 py-2",
        className,
      )}
    >
      <span className={cn("flex h-4.5 shrink-0 items-center [&_svg]:size-4", ink)}>
        {icon ?? <Icon aria-hidden="true" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium text-foreground">{title}</p>
        {children !== undefined ? <div className="min-w-0 text-muted-foreground">{children}</div> : null}
      </div>
      {action !== undefined ? <div className="-my-1 flex shrink-0 items-center gap-1">{action}</div> : null}
    </div>
  )
}
