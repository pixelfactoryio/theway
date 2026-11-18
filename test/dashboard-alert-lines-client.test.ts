import { expect, test } from "bun:test"
import { alertLines } from "../src/dashboard/client/lib/alert-lines"

const ERRORS = [
  { text: "bad key", line: 3 },
  { text: "no steps", line: null },
]

test("an error on a line `at` goes to reads `line N · text` and clicks there; another one is plain text", () => {
  const went: number[] = []
  const lines = alertLines(ERRORS, (line) => () => went.push(line))
  expect(lines.map((l) => l.text)).toEqual(["line 3 · bad key", "no steps"])
  lines[0]?.onClick?.()
  expect(went).toEqual([3])
  expect(lines[1]?.onClick).toBeNull()
})

test("without `at`, each error reads its text with `other`'s click, plain text when `other` gives none", () => {
  const seen: string[] = []
  const lines = alertLines(ERRORS, null, (e) => (e.line === null ? null : () => seen.push(e.text)))
  expect(lines.map((l) => l.text)).toEqual(["bad key", "no steps"])
  lines[0]?.onClick?.()
  expect(seen).toEqual(["bad key"])
  expect(lines[1]?.onClick).toBeNull()
  expect(alertLines(ERRORS, null).map((l) => l.onClick)).toEqual([null, null])
})

test("an `at` that gives no click leaves the error to `other`", () => {
  const lines = alertLines(
    ERRORS,
    () => null,
    () => null,
  )
  expect(lines.map((l) => [l.text, l.onClick])).toEqual([
    ["bad key", null],
    ["no steps", null],
  ])
})
