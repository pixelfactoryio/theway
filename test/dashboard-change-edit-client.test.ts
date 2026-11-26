import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { linked, splitTask, wrapped } from "../src/dashboard/client/lib/change-edit"

const CLIENT = join(import.meta.dirname, "..", "src", "dashboard", "client")

const apply = (doc: string, r: { from: number; to: number; insert: string; anchor: number; head: number }) => ({
  text: doc.slice(0, r.from) + r.insert + doc.slice(r.to),
  selected: [r.anchor, r.head],
})

test("Bold, Italic and Code wrap the selection, insert the pair at an empty one, and unwrap a wrapped one", () => {
  expect(apply("say hi", wrapped("say hi", 4, 6, "**"))).toEqual({ text: "say **hi**", selected: [6, 8] })
  expect(apply("say ", wrapped("say ", 4, 4, "_"))).toEqual({ text: "say __", selected: [5, 5] })
  expect(apply("a **b** c", wrapped("a **b** c", 2, 7, "**"))).toEqual({ text: "a b c", selected: [2, 3] })
  expect(apply("a `b` c", wrapped("a `b` c", 3, 4, "`"))).toEqual({ text: "a b c", selected: [2, 3] })
  expect(apply("x", linked("x", 0, 1))).toEqual({ text: "[x](https://)", selected: [1, 2] })
  expect(apply("", linked("", 0, 0))).toEqual({ text: "[](https://)", selected: [1, 1] })
})

test("the formatting keys take precedence, prevent the default and stop the event; no sonner, no toast", () => {
  const editor = readFileSync(join(CLIENT, "components", "markdown-editor.tsx"), "utf-8")
  expect(editor).toContain("Prec.highest(")
  expect(editor).toContain("preventDefault: true, stopPropagation: true")
  for (const key of ["Mod-b", "Mod-i", "Mod-e", "Mod-k"]) expect(editor).toContain(`"${key}"`)
  expect(editor).not.toMatch(/sonner|toast/)
})

test("the change page checks change.yaml with src/core/change-text", () => {
  const page = readFileSync(join(CLIENT, "pages", "change", "active.tsx"), "utf-8")
  expect(page).toMatch(/from "(\.\.\/){3,4}core\/change-text"/)
  expect(page).toContain("changeTextErrors")
})

test("splitTask cuts a task at its first clause or sentence, outside code, within 160 characters", () => {
  expect(splitTask("In `a.go` select the services: list the files, then pin them")).toEqual({
    lead: "In `a.go` select the services",
    detail: "list the files, then pin them",
  })
  expect(splitTask("Add the store; with tests")).toEqual({ lead: "Add the store", detail: "with tests" })
  expect(splitTask("Wire the middleware. Keep the order.")).toEqual({
    lead: "Wire the middleware.",
    detail: "Keep the order.",
  })
  expect(splitTask("Set `key: value` in the file")).toEqual({ lead: "Set `key: value` in the file", detail: "" })
  expect(splitTask("Return 429")).toEqual({ lead: "Return 429", detail: "" })
  const long = `${"x".repeat(170)}: rest`
  expect(splitTask(long)).toEqual({ lead: long, detail: "" })
})

test("splitTask falls back to the first ' (' or ', ' outside code, the lead at least 12 characters", () => {
  expect(splitTask("Write `apps/package.json` (`name`, `private`) and the lockfile")).toEqual({
    lead: "Write `apps/package.json`",
    detail: "(`name`, `private`) and the lockfile",
  })
  expect(
    splitTask("Move the handling into a helper shared with the unpin, then apply the order (files first)"),
  ).toEqual({
    lead: "Move the handling into a helper shared with the unpin",
    detail: "then apply the order (files first)",
  })
  expect(splitTask("Add x, then y")).toEqual({ lead: "Add x, then y", detail: "" })
})
