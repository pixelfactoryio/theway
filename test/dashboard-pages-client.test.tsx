import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import { Router } from "wouter"
import { ItemHeading, RunCommandControl } from "../src/dashboard/client/components/doc-frame"
import { ListFoot } from "../src/dashboard/client/components/list-grid"
import { PageUnknown } from "../src/dashboard/client/components/page-states"
import { SidebarProvider } from "../src/dashboard/client/components/ui/sidebar"
import { changeCommands, workflowCommand } from "../src/dashboard/client/lib/copy-targets"
import { SHORTCUTS } from "../src/dashboard/client/shell/keys"
import { MOD } from "../src/dashboard/client/shell/platform"

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
  // The one state shape, left-aligned on the panel's 16px gutter: the message, then the way back.
  expect(html).toMatch(
    /data-slot="state" class="[^"]*\bpx-4\b[^"]*">.*No project nope.*<a [^>]*href="\/x"[^>]*>Back to All projects<\/a>/s,
  )
  // A project's or a group's page renders it, as a workflow's, a prompt's and a change's do, and no view of its own.
  for (const file of [
    "pages/workspace/scope.tsx",
    "pages/workflow/page.tsx",
    "pages/prompt/page.tsx",
    "pages/change/change.tsx",
  ])
    expect([file, read(file).includes("<PageUnknown")]).toEqual([file, true])
  const scope = read("pages/workspace/scope.tsx")
  expect(scope).toContain('back={{ label: "Back to All projects", href: to.projects() }}')
  expect(scope).not.toMatch(/exist/)
})

test("every list page ends with the one list foot, 32px under its last row", () => {
  expect(renderToStaticMarkup(<ListFoot />)).toBe('<div class="pb-8"></div>')
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
    "components/list-kit.tsx",
  ])
    expect([file, /\bpb-\d/.test(read(file))]).toEqual([file, false])
})

test("an item's page states its title once, above every view, its ID or file name once in the header's path", () => {
  // The title: in the reading column, at the reading scale's title size, outside the view's scroll root.
  const html = renderToStaticMarkup(<ItemHeading title="Split the client" />)
  expect(html).toMatch(
    /^<div class="shrink-0 [^"]*\bpt-8 pb-4\b[^"]*\bpx-4\b[^"]*"><div class="w-full max-w-\(--read-width\)">/,
  )
  // A hairline under it only once the view under it is scrolled.
  expect(html).toContain("border-transparent")
  expect(html).toContain("[&amp;:has(~[data-scrolled])]:border-border")
  // Balanced, cut at three lines; Show more reads it whole when that cuts it, so nothing of it is left to a hover.
  expect(html).toContain(
    '<h2 class="text-doc-title font-semibold tracking-tight text-balance text-foreground line-clamp-3">Split the client</h2>',
  )
  expect(read("components/doc-frame.tsx")).toContain('{more ? "Show less" : "Show more"}')
  // An item with no description has no title: its ID or file name stands once, in the header's path.
  expect(renderToStaticMarkup(<ItemHeading title={null} />)).toBe("")
  expect(renderToStaticMarkup(<ItemHeading title="  " />)).toBe("")
  // A change's, a workflow's and a prompt's page are one frame: the header with the mono ID or name, the pill views,
  // the title passed once to the frame (never to a view), the panel's cards; no page builds a header of its own.
  const heading = {
    "pages/change/active.tsx": "heading={<ChangeHeading",
    "pages/change/archived.tsx": "heading={<ChangeHeading",
    "pages/workflow/page.tsx": "heading={<ItemHeading",
    "pages/prompt/page.tsx": "heading={<ItemHeading",
  }
  for (const [file, passed] of Object.entries(heading)) {
    const text = read(file)
    expect([file, text.match(/<DocFrame\b/g)?.length]).toEqual([file, 1])
    expect([file, text.match(/<(ChangeHeading|ItemHeading)\b/g)?.length]).toEqual([file, 1])
    expect([file, text.includes(passed)]).toEqual([file, true])
    expect([file, /title=\{(data\.id|name)\}\s+mono\b/.test(text)]).toEqual([file, true])
    expect([file, /<(DocTab|CodeTab|HistoryTab)\b[^>]*\btitle=/.test(text)]).toEqual([file, false])
    expect([file, /<ViewTabs\b|<RecordBody\b|<PanelToggle\b/.test(text)]).toEqual([file, false])
  }
  // The views take no title of their own.
  for (const file of ["components/code-tab.tsx", "components/history.tsx", "components/doc-tab.tsx"])
    expect([file, /\btitle\??:/.test(read(file))]).toEqual([file, false])
})

test("a change's panel is stacked property cards, and its tasks mark the next one without colour", () => {
  const panel = read("components/change-panel.tsx")
  expect(panel).toContain("<PropertyCards>")
  // Its first card is the status card every item's panel opens with.
  expect(panel).toContain("<StatusCard")
  for (const card of ['title="Tasks"', 'title="Details"', 'title="Series"']) expect(panel).toContain(card)
  expect(panel).not.toContain("DocPanel")
  // The Series card lists its members with the list kit.
  expect(panel).toContain("<ListRow")
  const tasks = read("components/task-list.tsx")
  expect(tasks).not.toMatch(/shadow-\[inset|text-warning|border-warning|bg-warning/)
})

test("the document scale: body leading within 120 to 145%, headings under the page's title, each step smaller", () => {
  const css = readFileSync(join(client, "styles", "globals.css"), "utf-8")
  const rem = (token: string) => Number(new RegExp(`--${token}: ([\\d.]+)rem;`).exec(css)?.[1])
  for (const level of ["doc", "doc-title", "doc-h1", "doc-h2", "doc-h3"]) {
    const ratio = rem(`text-${level}--line-height`) / rem(`text-${level}`)
    expect([level, ratio >= 1.2 && ratio <= 1.45]).toEqual([level, true])
  }
  const sizes = ["doc-title", "doc-h1", "doc-h2", "doc-h3"].map((l) => rem(`text-${l}`))
  expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
  expect(rem("text-doc-h3") >= rem("text-doc")).toBe(true)
})

test("a change's header copies its run commands: the default workflow, agents, and archive", () => {
  expect(changeCommands("add-x")).toEqual([
    { label: "Run with the default workflow", command: "/theway:workflow add-x" },
    { label: "Run with agents", command: "/theway:workflow --workflow agents add-x" },
    { label: "Archive", command: "/theway:archive add-x" },
  ])
  // A workflow's command leaves its inputs to the user.
  expect(workflowCommand("review")).toEqual({
    label: "Run this workflow",
    command: "/theway:workflow --workflow review",
  })
})

test("the header's run command is a visible button; a change's other commands are behind its chevron", () => {
  const change = renderToStaticMarkup(<RunCommandControl commands={changeCommands("add-x")} />)
  expect(change).toContain("Copy run command")
  expect(change).toContain('aria-label="More run commands"')
  // A workflow has one command: the button alone.
  const workflow = renderToStaticMarkup(<RunCommandControl commands={[workflowCommand("review")]} />)
  expect(workflow).toContain("Copy run command")
  expect(workflow).not.toContain("More run commands")
  // The title keeps its copy button only: no command chevron after it.
  expect(read("components/doc-frame.tsx")).not.toContain("Copy a command")
})

test("copy controls show no tooltip: the toast says what was copied", () => {
  for (const file of ["components/copy.tsx", "components/doc-frame.tsx"]) {
    expect([file, /Tooltip/.test(read(file))]).toEqual([file, false])
  }
})

test("the shortcut sheet lists C under Anywhere and the search's copy under Search", () => {
  const group = (title: string) => SHORTCUTS.find((g) => g.title === title)?.rows ?? []
  expect(group("Anywhere").find((r) => r.keys.join() === "C")).toEqual({
    keys: ["C"],
    action: "Copy the page's ID or name",
  })
  expect(group("Search")).toEqual([{ keys: [MOD, "C"], action: "Copy the highlighted entry's ID" }])
})
