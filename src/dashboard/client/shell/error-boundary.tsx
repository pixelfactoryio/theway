import { CircleAlertIcon } from "lucide-react"
import { Component, type ReactNode } from "react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { resetOnKeyChange } from "@/lib/boundary"
import { PageBody, TopBar } from "@/shell/top-bar"

type BoundaryProps = {
  children: ReactNode
  /** Clears a caught error when it changes. */
  resetKey?: string
  fallback: (error: Error, reset: () => void) => ReactNode
}

/**
 * Catches a render error below it and renders `fallback` in its place. React's default `onCaughtError` already logs the
 * error, so it has no `componentDidCatch`.
 */
export class ErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  /** Clears only an error shown before the key changed: one caught in the update that changed the key stays. */
  componentDidUpdate(prev: BoundaryProps, prevState: { error: Error | null }): void {
    if (resetOnKeyChange(prev.resetKey, this.props.resetKey, prevState.error !== null)) this.setState({ error: null })
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    return this.state.error !== null ? this.props.fallback(this.state.error, this.reset) : this.props.children
  }
}

/** A page that failed to render: an "Error" breadcrumb, the error, and a Try again that renders the page again. */
export function PageError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <TopBar items={[{ label: "Error" }]} />
      <PageBody>
        <Alert variant="destructive" className="m-4 w-auto">
          <CircleAlertIcon className="size-4" aria-hidden="true" />
          <AlertTitle>This page failed to render</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="xs" onClick={reset}>
              Try again
            </Button>
          </AlertAction>
        </Alert>
      </PageBody>
    </>
  )
}

/** The dashboard failed to render outside a page: the error, full height, and a Reload. */
export function RootError({ error }: { error: Error }) {
  return (
    <Empty className="flex h-svh items-center justify-center">
      <EmptyHeader>
        <EmptyTitle>The dashboard failed to render</EmptyTitle>
        <EmptyDescription>{error.message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </EmptyContent>
    </Empty>
  )
}
