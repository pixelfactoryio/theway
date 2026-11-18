import { CircleAlertIcon } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"

/**
 * A failed load: its title ("Could not load <what>" unless `title` is given), the error, and an action button
 * (`action`, Retry by default) that calls `retry`.
 */
export function LoadError(
  props: { error: Error; retry: () => void; className?: string; action?: string } & (
    { what: string; title?: never } | { title: string; what?: never }
  ),
) {
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
