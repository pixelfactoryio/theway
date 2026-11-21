import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Router } from "wouter"
import { InputsCard, ProblemsCard, UsedByCard } from "../src/dashboard/client/components/fact-cards"
import { placeOfUse } from "../src/dashboard/client/lib/files"

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()

test("a use's place is its step, its on-fail or a value in its step", () => {
  expect(
    [
      { workflow: "ship", project: null, step: 2, as: "step" as const },
      { workflow: "ship", project: null, step: 3, as: "on-fail" as const },
      { workflow: "ship", project: null, step: 4, as: "value" as const },
    ].map(placeOfUse),
  ).toEqual(["step 2", "on-fail of step 3", "value in step 4"])
})

test("the Used by card opens each workflow's page and gives where it uses the prompt; a note when none does", () => {
  const html = renderToStaticMarkup(
    <Router ssrPath="/">
      <UsedByCard
        uses={[
          { workflow: "ship", project: null, step: 2, as: "step" },
          { workflow: "review", project: "-home-dev-acme", step: 1, as: "on-fail" },
        ]}
        label={() => "acme"}
      />
    </Router>,
  )
  expect(text(html)).toBe("Used by 2 ship step 2 review acme on-fail of step 1")
  // Each link is `to.file`'s address of the workflow, which ends with `?`.
  expect([...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])).toEqual([
    "/workflows/global/ship?",
    "/workflows/projects/-home-dev-acme/review?",
  ])
  const none = renderToStaticMarkup(<UsedByCard uses={[]} label={(k) => k} />)
  expect(text(none)).toBe("Used by No workflow uses this prompt.")
})

test("the Inputs card gives each input's name, its requirement as a chip and its description", () => {
  const html = renderToStaticMarkup(
    <InputsCard
      inputs={[
        { name: "change", required: true, default: null, description: "The change ID" },
        { name: "lens", required: false, default: "finish", description: "" },
        { name: "notes", required: false, default: null, description: "Extra notes" },
      ]}
    />,
  )
  expect(text(html)).toBe('Inputs 3 change required The change ID lens default "finish" notes optional Extra notes')
  expect(html).toContain('<span class="min-w-0 truncate font-mono text-xs text-foreground">change</span>')
})

test("the Problems card lists each error with its mark, a button when a click goes to its place", () => {
  const html = renderToStaticMarkup(
    <ProblemsCard
      lines={[
        { text: "line 2 · description: missing", onClick: () => undefined },
        { text: "used by ship: unknown input", onClick: null },
      ]}
    />,
  )
  expect(text(html)).toBe("Problems 2 line 2 · description: missing used by ship: unknown input")
  expect(html.match(/<button/g)?.length).toBe(1)
  expect(html.match(/data-status="invalid"/g)?.length).toBe(2)
})
