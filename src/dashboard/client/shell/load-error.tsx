import { CircleAlertIcon } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"

type LoadErrorProps = { error: Error; retry: () => void; action?: string } & (
  { what: string; title?: never } | { title: string; what?: never }
)

/**
 * A failed load: its title ("Could not load <what>" unless `title` is given), the error, and an action button
 * (`action`, Retry by default) that calls `retry`. A page's is a `PageLoadError`; `className` places one elsewhere (the
 * sidebar, a panel).
 */
export function LoadError(props: LoadErrorProps & { className?: string }) {
  const { error, retry, className, action = "Retry" } = props
  return (
    <Alert variant="destructive" className={className}>
      <CircleAlertIcon className="size-4" aria-hidden="true" />
      <AlertTitle>{props.title ?? `Could not load ${props.what}`}</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
      <AlertAction>
        <Button variant="outline" size="xs" onClick={retry}>
          {action}
        </Button>
      </AlertAction>
    </Alert>
  )
}

/**
 * A failed load in a page's centre, the same on every page: on the page's 24px gutters, 16px under what stands above
 * it.
 */
export function PageLoadError(props: LoadErrorProps) {
  return <LoadError {...props} className="mx-6 my-4 w-auto" />
}
