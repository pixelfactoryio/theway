import { Component, type ReactNode } from "react"

import { CircleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PageLoadError } from "@/shell/load-error"
import { Logo } from "@/shell/logo"
import { StateBlock } from "@/shell/state"
import { PageBody, PageHeader } from "@/shell/top-bar"

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
    if (prevState.error !== null && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    return this.state.error !== null ? this.props.fallback(this.state.error, this.reset) : this.props.children
  }
}

/** A page that failed to render: an "Error" title, the error, and a Try again that renders the page again. */
export function PageError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <PageHeader title="Error" />
      <PageBody>
        <PageLoadError title="This page failed to render" action="Try again" error={error} retry={reset} />
      </PageBody>
    </>
  )
}

/**
 * The dashboard failed to render outside a page: the shell's frame without its sidebar (the app's ground, the inset
 * panel, a header with the logo), and in the one state shape the error and Reload.
 */
export function RootError({ error }: { error: Error }) {
  return (
    <div className="flex h-svh flex-col bg-ground p-2">
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-xs">
        <div className="flex h-11 shrink-0 items-center pr-3 pl-4">
          <Logo />
        </div>
        <StateBlock
          role="alert"
          size="page"
          icon={<CircleAlertIcon aria-hidden="true" className="text-destructive" />}
          title="The dashboard failed to render"
          action={
            <Button variant="outline" size="xs" onClick={() => window.location.reload()}>
              Reload
            </Button>
          }
        >
          {error.message}
        </StateBlock>
      </main>
    </div>
  )
}
