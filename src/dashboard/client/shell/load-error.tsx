import { CircleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { StateBlock } from "@/shell/state"

type LoadErrorProps = { error: Error; retry: () => void; action?: string } & (
  { what: string; title?: never } | { title: string; what?: never }
)

/**
 * A failed load, in the one state shape: the red alert icon, its title ("Could not load <what>" unless `title` is
 * given), the error, and an action button (`action`, Retry by default) that calls `retry`. A page's is a
 * `PageLoadError`; `className` places one elsewhere (the sidebar, a panel).
 */
export function LoadError(props: LoadErrorProps & { className?: string; size?: "page" | "inline" }) {
  const { error, retry, className, action = "Retry", size = "inline" } = props
  return (
    <StateBlock
      role="alert"
      size={size}
      icon={<CircleAlertIcon aria-hidden="true" className="text-destructive" />}
      title={props.title ?? `Could not load ${props.what}`}
      action={
        <Button variant="outline" size="xs" onClick={retry}>
          {action}
        </Button>
      }
      className={className}
    >
      {error.message}
    </StateBlock>
  )
}

/** A failed load in a page's body, the same on every page: on the panel's 16px gutter, 24px under what is above it. */
export function PageLoadError(props: LoadErrorProps) {
  return <LoadError {...props} size="page" />
}
