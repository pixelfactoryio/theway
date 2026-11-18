import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "yaml"
import { emptyText, lineCounts, localTime, saveWithErrors, yamlValue } from "../src/dashboard/client/lib/edit"

const CLIENT = join(import.meta.dirname, "..", "src", "dashboard", "client")

test("times show as YYYY-MM-DD HH:MM:SS in the local time zone", () => {
  expect(localTime(new Date(2026, 10, 12, 9, 41, 7).toISOString())).toBe("2026-11-12 09:41:07")
})

test("an Empty file is exactly its four lines, its description reading back as typed", () => {
  expect(emptyText("workflows", "Ship it")).toBe(
    "version: theway.workflow/v1beta1\ndescription: Ship it\nruns-on: agents\nsteps: []\n",
  )
  expect(emptyText("prompts", "Review it")).toBe("---\ndescription: Review it\nmodel: opus\n---\n")
  for (const d of ["a: b", "#x", "yes", "  padded ", 'quote\'s "two"', "123", "- dash", "x".repeat(200)]) {
    expect([d, (parse(emptyText("workflows", d)) as { description: unknown }).description]).toEqual([d, d])
    expect(yamlValue(d).endsWith("\n")).toBe(false)
  }
})

test("the strings of the save confirmation and the versions list", () => {
  expect([saveWithErrors(1), saveWithErrors(3)]).toEqual(["Save with 1 error?", "Save with 3 errors?"])
  expect(lineCounts(2, 0)).toBe("+2 −0 lines")
})

test("the editable set adds Mod-Shift-z as redo, and the draft is read with sliceDoc only", () => {
  const code = readFileSync(join(CLIENT, "components", "code-view.tsx"), "utf-8")
  expect(code).toContain('{ key: "Mod-Shift-z", run: redo, preventDefault: true }')
  const sources = [
    "drafts/draft-set.ts",
    "drafts/use-drafts.ts",
    "components/file-draft.ts",
    "pages/prompt.tsx",
    "pages/workflow.tsx",
  ]
    .map((f) => readFileSync(join(CLIENT, f), "utf-8"))
    .join("\n")
  expect(sources).not.toContain("doc.toString()")
  expect(sources).toContain("sliceDoc()")
})

test("the app's router hook carries hrefs and guards navigation", () => {
  const app = readFileSync(join(CLIENT, "app.tsx"), "utf-8")
  expect(app).toContain("<Router hook={useGuardedLocation}>")
  const guard = readFileSync(join(CLIENT, "shell", "guard.ts"), "utf-8")
  expect(guard).toContain("useGuardedLocation.hrefs =")
})

test("the History tab keeps the layout under theway-diff-layout, marks no scroll root, and both diffs take the shared set", () => {
  const history = readFileSync(join(CLIENT, "components", "history.tsx"), "utf-8")
  expect(history).toContain('"theway-diff-layout"')
  expect(history).not.toContain("data-scroll-root")
  expect(history).toContain('aria-label="Diff layout"')
  const code = readFileSync(join(CLIENT, "components", "code-view.tsx"), "utf-8")
  expect(code).toContain("unifiedMergeView({ original, mergeControls: false, collapseUnchanged: COLLAPSE })")
  expect(code).toContain("new MergeView(")
  expect(code).toContain("const COLLAPSE = { margin: 3, minSize: 4 }")
})
