import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import { Router } from "wouter"
import { SidebarProvider } from "../src/dashboard/client/components/ui/sidebar"
import { ErrorBoundary, PageError, RootError } from "../src/dashboard/client/shell/error-boundary"

test("a boundary keeps an error caught in the update that changed its key, and clears one shown before it", () => {
  const fallback = () => null
  const error = new Error("x")
  const boundary = new ErrorBoundary({ children: null, resetKey: "/b", fallback })
  boundary.state = { error }
  const cleared: unknown[] = []
  boundary.setState = ((next: unknown) => cleared.push(next)) as typeof boundary.setState

  // Navigating from /a to a page that throws: the error was caught in this update, so it stays.
  boundary.componentDidUpdate({ children: null, resetKey: "/a", fallback }, { error: null })
  expect(cleared).toEqual([])

  // Navigating from /a, where the error showed, to /b: it clears.
  boundary.componentDidUpdate({ children: null, resetKey: "/a", fallback }, { error })
  expect(cleared).toEqual([{ error: null }])
})

test("a caught error becomes the boundary's state, a thrown non-Error as an Error", () => {
  const error = new Error("x")
  expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ error })
  expect(ErrorBoundary.getDerivedStateFromError(error).error).toBe(error)
  const wrapped = ErrorBoundary.getDerivedStateFromError("s").error
  expect(wrapped).toBeInstanceOf(Error)
  expect(wrapped.message).toBe("s")
})

test("the page fallback shows the error and Try again", () => {
  // The page's top row reads the sidebar's state, so it renders inside the shell's providers.
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <Router ssrPath="/">
        <SidebarProvider>
          <PageError error={new Error("boom")} reset={() => {}} />
        </SidebarProvider>
      </Router>
    </QueryClientProvider>,
  )
  expect(html).toContain("This page failed to render")
  expect(html).toContain("boom")
  expect(html).toContain("Try again")
  // A page's alert stands on the page's 24px gutters.
  expect(html).toMatch(/<div data-slot="alert" role="alert" class="[^"]*\bmx-6 my-4 w-auto"/)
})

test("every failed load in a page's centre is the one page alert; only the sidebar and a panel place their own", () => {
  const client = join(import.meta.dirname, "..", "src", "dashboard", "client")
  const files = (dir: string): string[] =>
    readdirSync(join(client, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
    )
  const own = ["components", "pages", "shell"]
    .flatMap(files)
    .filter((file) => !/^components\/(ui|reui)\//.test(file) && file !== "shell/load-error.tsx")
    .filter((file) => readFileSync(join(client, file), "utf-8").includes("<LoadError"))
  expect(own.sort()).toEqual(["components/step-prompt.tsx", "shell/app-sidebar.tsx"])
  expect(readFileSync(join(client, "shell/load-error.tsx"), "utf-8")).toContain(
    '<LoadError {...props} className="mx-6 my-4 w-auto" />',
  )
})

test("the root fallback shows the error and Reload", () => {
  const html = renderToStaticMarkup(<RootError error={new Error("boom")} />)
  expect(html).toContain("The dashboard failed to render")
  expect(html).toContain("boom")
  expect(html).toContain("Reload")
})
