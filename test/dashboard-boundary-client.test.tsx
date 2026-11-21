import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
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
  // A page's error is the one state shape, an alert on the panel's 16px gutter, 24px under the header.
  expect(html).toMatch(/<div data-slot="state" role="alert" class="flex items-start gap-3 px-4 pt-6 pb-3"/)
})

test("every failed load in a page's centre is the one page alert; only a panel places its own, the sidebar none", () => {
  const client = join(import.meta.dirname, "..", "src", "dashboard", "client")
  const own = readdirSync(client, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
    .map((e) => relative(client, join(e.parentPath, e.name)).split(sep).join("/"))
    .filter((file) => !/^(components\/(ui|reui)|hooks)\//.test(file) && file !== "shell/load-error.tsx")
    .filter((file) => readFileSync(join(client, file), "utf-8").includes("<LoadError"))
  expect(own.sort()).toEqual(["components/step-prompt.tsx"])
})

test("the root fallback shows the error and Reload", () => {
  const html = renderToStaticMarkup(<RootError error={new Error("boom")} />)
  expect(html).toContain("The dashboard failed to render")
  expect(html).toContain("boom")
  expect(html).toContain("Reload")
})
