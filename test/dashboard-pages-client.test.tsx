import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import { Router } from "wouter"
import { ColumnTitle, DocTitle, GutterTitle } from "../src/dashboard/client/components/doc-title"
import { PageUnknown } from "../src/dashboard/client/components/page-states"
import { SidebarProvider } from "../src/dashboard/client/components/ui/sidebar"

const client = join(import.meta.dirname, "..", "src", "dashboard", "client")
const read = (file: string) => readFileSync(join(client, file), "utf-8")

test("an address naming no project or group is the shared unknown page: its name, the message, the way back", () => {
  // The page's top row reads the sidebar's state, so it renders inside the shell's providers.
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <Router ssrPath="/">
        <SidebarProvider>
          <PageUnknown title="nope" message="No project nope" back={{ label: "Back to All projects", href: "/x" }} />
        </SidebarProvider>
      </Router>
    </QueryClientProvider>,
  )
  expect(html).toContain(">nope</h1>")
  expect(html).toMatch(/data-slot="empty"[^>]*>.*No project nope.*<a [^>]*href="\/x"[^>]*>Back to All projects<\/a>/s)
  // A project's or a group's page renders it, as a workflow's, a prompt's and a change's do, and no view of its own.
  for (const file of [
    "pages/workspace/scope.tsx",
    "pages/workflow/page.tsx",
    "pages/prompt/page.tsx",
    "pages/change/change.tsx",
  ])
    expect([file, read(file).includes("<PageUnknown")]).toEqual([file, true])
  const scope = read("pages/workspace/scope.tsx")
  expect(scope).toContain("if (projects !== null && entry === null) {")
  expect(scope).toContain('back={{ label: "Back to All projects", href: to.projects() }}')
  expect(scope).not.toMatch(/exist/)
})

test("every list page ends with the one list foot, 32px under its last row", () => {
  expect(read("components/list-grid.tsx")).toContain('return <div className="pb-8">{children}</div>')
  for (const file of [
    "pages/workspace/now.tsx",
    "pages/workspace/scope.tsx",
    "pages/workspace/projects.tsx",
    "components/file-list.tsx",
  ])
    expect([file, read(file).includes("<ListFoot")]).toEqual([file, true])
  // Workflows and Prompts scroll inside their grid: the foot stands under the table, in the scroll area.
  expect(read("components/file-list.tsx")).toMatch(/<DataGridTable \/>\s*<ListFoot \/>\s*<\/DataGridScrollArea>/)
  // No page and no hint keeps a foot of its own.
  for (const file of [
    "pages/workspace/now.tsx",
    "pages/workspace/scope.tsx",
    "pages/workspace/projects.tsx",
    "pages/files/workflows.tsx",
    "pages/files/prompts.tsx",
    "components/file-list.tsx",
    "components/group-band.tsx",
    "components/band-grid.tsx",
  ])
    expect([file, /\bpb-\d/.test(read(file))]).toEqual([file, false])
})

test("a title on the gutter is the same on every page; in the document column it takes the document's ink", () => {
  const title = <DocTitle caption="Prompts · Global" title="implement" description="What it does" />
  const h1 = (html: string) => /<h1 class="([^"]*)"/.exec(html)?.[1]
  const text = (html: string) => /<p class="([^"]*)">What it does/.exec(html)?.[1]
  // On a canvas (no wrapper) and in the gutter wrapper: the interface's ink, the description at most 36rem.
  for (const html of [renderToStaticMarkup(title), renderToStaticMarkup(<GutterTitle rule>{title}</GutterTitle>)]) {
    expect(h1(html)).toBe("mt-1 text-title font-semibold tracking-tight text-foreground")
    expect(text(html)).toBe("text-sm text-muted-foreground max-w-xl")
  }
  const column = renderToStaticMarkup(<ColumnTitle>{title}</ColumnTitle>)
  expect(h1(column)).toBe("mt-1 text-title font-semibold tracking-tight text-doc-foreground")
  expect(text(column)).toBe("text-sm text-muted-foreground")
  // No page chooses a title's ink or its description's width.
  for (const file of ["pages/workflow/page.tsx", "pages/prompt/page.tsx", "components/change-header.tsx"])
    expect([file, /<DocTitle[^>]*\bvariant=/.test(read(file))]).toEqual([file, false])
})
