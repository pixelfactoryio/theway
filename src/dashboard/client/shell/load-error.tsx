import { CircleAlertIcon } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"

/** A failed load: "Could not load <what>", the error, and a Retry that refetches. */
export function LoadError({
  what,
  error,
  retry,
  className,
}: {
  what: string
  error: Error
  retry: () => void
  className?: string
}) {
  return (
    <Alert variant="destructive" className={className}>
      <CircleAlertIcon className="size-4" aria-hidden="true" />
      <AlertTitle>Could not load {what}</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
      <AlertAction>
        <Button variant="outline" size="xs" onClick={retry}>
          Retry
        </Button>
      </AlertAction>
    </Alert>
  )
}
