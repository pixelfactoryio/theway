import { expect, test } from "bun:test"
import { history, undoDepth } from "@codemirror/commands"
import { EditorState } from "@codemirror/state"
import type { Sent } from "../src/dashboard/client/data/api"
import { DraftSet, type Outcome } from "../src/dashboard/client/drafts/draft-set"
import type { FileError } from "../src/dashboard/client/lib/files"

/** A promise and the function that settles it. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

type Put = { name: string; text: string; base: string }

/** A set whose `put` answers `answer` (or the next of `answers`) and records its calls, and whose check is `check`. */
function setOf(
  answer: (call: Put) => Promise<Sent<{ version: string }>> = async () => ({
    status: 200,
    body: { version: "v2" },
    error: "",
  }),
  check?: (name: string, text: string) => Promise<Outcome>,
): { set: DraftSet; puts: Put[] } {
  const puts: Put[] = []
  const set = new DraftSet({
    stateOf: (_, text) => EditorState.create({ doc: text, extensions: [history()] }),
    put: (name, text, base) => {
      const call = { name, text, base }
      puts.push(call)
      return answer(call)
    },
    check,
    checkDelay: 0,
  })
  return { set, puts }
}

/** Types `insert` at the end of the draft `name`. */
function type(set: DraftSet, name: string, insert: string): void {
  const store = set.get(name)!.store
  store.dispatch({ changes: { from: store.state.doc.length, insert } })
}

const tick = () => new Promise((r) => setTimeout(r, 0))

const line = (text: string): FileError => ({ line: 1, text })

test("sync adds a draft per new file, in order, equal to its file", () => {
  const { set } = setOf()
  let calls = 0
  set.subscribe(() => calls++)
  set.sync([
    { name: "spec.md", text: "# Spec\n", version: "a" },
    { name: "change.yaml", text: "tasks: []\n", version: "b" },
  ])
  expect(set.names()).toEqual(["spec.md", "change.yaml"])
  expect(set.text("spec.md")).toBe("# Spec\n")
  expect(set.get("change.yaml")!.loaded).toEqual({ text: "tasks: []\n", version: "b" })
  expect(set.get("spec.md")!.epoch).toBe(0)
  expect(set.anyDirty()).toBe(false)
  expect(calls).toBe(1)
  expect(set.text("missing")).toBeNull()
})

test("a dispatch makes the draft dirty, and only that draft", () => {
  const { set } = setOf()
  set.sync([
    { name: "a.md", text: "a", version: "1" },
    { name: "b.md", text: "b", version: "1" },
  ])
  type(set, "a.md", "!")
  expect(set.isDirty("a.md")).toBe(true)
  expect(set.isDirty("b.md")).toBe(false)
  expect(set.anyDirty()).toBe(true)
})

test("a clean draft follows a refetch, with its lines; a dirty one ignores it", () => {
  const { set } = setOf()
  set.sync([
    { name: "a.md", text: "a", version: "1" },
    { name: "b.md", text: "b", version: "1" },
  ])
  type(set, "b.md", "!")
  set.sync([
    { name: "a.md", text: "a2", version: "2", errors: [line("bad")] },
    { name: "b.md", text: "b2", version: "2" },
  ])
  expect(set.text("a.md")).toBe("a2")
  expect(set.get("a.md")!.loaded).toEqual({ text: "a2", version: "2" })
  expect(set.get("a.md")!.result).toEqual({ text: "a2", errors: [line("bad")], header: null })
  expect(set.isDirty("a.md")).toBe(false)
  expect(set.text("b.md")).toBe("b!")
  expect(set.get("b.md")!.loaded).toEqual({ text: "b", version: "1" })
})

test("save on 200 takes the saved text and version, and Saved shows until a further edit", async () => {
  const { set, puts } = setOf()
  set.sync([{ name: "a.md", text: "a", version: "1" }])
  type(set, "a.md", "!")
  expect(await set.save("a.md")).toBe(true)
  expect(puts).toEqual([{ name: "a.md", text: "a!", base: "1" }])
  const d = set.get("a.md")!
  expect(d.loaded).toEqual({ text: "a!", version: "v2" })
  expect([d.saving, d.conflict, d.saveFailure]).toEqual([false, false, null])
  expect(set.isDirty("a.md")).toBe(false)
  expect(set.isSaved("a.md")).toBe(true)
  type(set, "a.md", "?")
  expect(set.isSaved("a.md")).toBe(false)
})

test("save on 409 sets the conflict, and on 500 the failure, keeping the draft", async () => {
  const conflict = setOf(async () => ({ status: 409, body: null, error: "changed on disk" }))
  conflict.set.sync([{ name: "a.md", text: "a", version: "1" }])
  type(conflict.set, "a.md", "!")
  expect(await conflict.set.save("a.md")).toBe(false)
  expect(conflict.set.get("a.md")!.conflict).toBe(true)
  expect(conflict.set.get("a.md")!.saveFailure).toBeNull()
  expect(conflict.set.isDirty("a.md")).toBe(true)

  const failed = setOf(async () => ({ status: 500, body: null, error: "" }))
  failed.set.sync([{ name: "a.md", text: "a", version: "1" }])
  type(failed.set, "a.md", "!")
  expect(await failed.set.save("a.md")).toBe(false)
  expect(failed.set.get("a.md")!.conflict).toBe(false)
  expect(failed.set.get("a.md")!.saveFailure).toBe("500")
  expect(failed.set.get("a.md")!.loaded.version).toBe("1")
})

test("a second save while one runs answers false without a second put", async () => {
  const answer = deferred<Sent<{ version: string }>>()
  const { set, puts } = setOf(() => answer.promise)
  set.sync([{ name: "a.md", text: "a", version: "1" }])
  type(set, "a.md", "!")
  const first = set.save("a.md")
  expect(set.get("a.md")!.saving).toBe(true)
  expect(await set.save("a.md")).toBe(false)
  answer.resolve({ status: 200, body: { version: "2" }, error: "" })
  expect(await first).toBe(true)
  expect(puts.length).toBe(1)
  expect(set.get("a.md")!.saving).toBe(false)
})

test("discard and reload reset the text and the undo history, and bump the epoch", () => {
  const { set } = setOf()
  set.sync([{ name: "a.md", text: "a", version: "1" }])
  type(set, "a.md", "!")
  expect(undoDepth(set.get("a.md")!.store.state)).toBe(1)
  set.discard("a.md")
  expect(set.text("a.md")).toBe("a")
  expect(undoDepth(set.get("a.md")!.store.state)).toBe(0)
  expect(set.get("a.md")!.epoch).toBe(1)

  type(set, "a.md", "?")
  set.fail("a.md", "boom")
  set.update("a.md", { conflict: true })
  set.reload("a.md", { text: "fresh", version: "9", errors: [line("bad")] })
  const d = set.get("a.md")!
  expect(set.text("a.md")).toBe("fresh")
  expect(d.loaded).toEqual({ text: "fresh", version: "9" })
  expect(d.result.errors).toEqual([line("bad")])
  expect(undoDepth(d.store.state)).toBe(0)
  expect([d.epoch, d.conflict, d.saveFailure, d.savedDoc]).toEqual([2, false, null, null])
  expect(set.isDirty("a.md")).toBe(false)
})

test("isSaved is false after a discard", async () => {
  const { set } = setOf()
  set.sync([{ name: "a.md", text: "a", version: "1" }])
  type(set, "a.md", "!")
  await set.save("a.md")
  set.discard("a.md")
  expect(set.isSaved("a.md")).toBe(false)
})

test("checks in flight are deduped by text, and an answer for a text the draft no longer holds is dropped", async () => {
  const answers = new Map<string, ReturnType<typeof deferred<Outcome>>>()
  const checked: string[] = []
  const { set } = setOf(undefined, (_, text) => {
    checked.push(text)
    const d = deferred<Outcome>()
    answers.set(text, d)
    return d.promise
  })
  set.sync([{ name: "p.md", text: "x", version: "1" }])
  type(set, "p.md", "1")
  const a = set.runCheck("p.md", "x1")
  const b = set.runCheck("p.md", "x1")
  expect(a).toBe(b)
  expect(checked).toEqual(["x1"])

  // The draft moves on before the answer for "x1" arrives: that answer is dropped.
  type(set, "p.md", "2")
  answers.get("x1")!.resolve({ ok: true, errors: [line("stale")], header: null })
  await a
  await tick()
  expect(set.get("p.md")!.result.errors).toEqual([])

  // The answer for the text the draft holds is applied, with the header fields while it differs from the file.
  const header = { header: true, description: "d", model: "opus", inputs: [] }
  const c = set.runCheck("p.md", "x12")
  answers.get("x12")!.resolve({ ok: true, errors: [line("fresh")], header })
  await c
  await tick()
  const d = set.get("p.md")!
  expect(d.result).toEqual({ text: "x12", errors: [line("fresh")], header })
  expect(d.details).toEqual(header)

  // A failed check is kept apart from the lines.
  const e = set.runCheck("p.md", "x12")
  expect(checked).toEqual(["x1", "x12", "x12"])
  answers.get("x12")!.resolve({ ok: false, error: "no answer" })
  await e
  await tick()
  expect(set.get("p.md")!.checkFailure).toBe("no answer")
  expect(set.get("p.md")!.result.errors).toEqual([line("fresh")])
})

test("an edit is checked after the delay, and a save keeps the check's lines as the loaded lines", async () => {
  const checked: string[] = []
  const { set } = setOf(undefined, async (_, text) => {
    checked.push(text)
    return { ok: true, errors: text.includes("!") ? [line("bang")] : [], header: null }
  })
  set.sync([{ name: "p.md", text: "x", version: "1" }])
  set.edited("p.md")
  await tick()
  expect(checked).toEqual([])
  type(set, "p.md", "!")
  set.edited("p.md")
  set.edited("p.md")
  await tick()
  await tick()
  expect(checked).toEqual(["x!"])
  expect(set.get("p.md")!.result.errors).toEqual([line("bang")])
  expect(await set.save("p.md")).toBe(true)
  type(set, "p.md", "?")
  set.discard("p.md")
  expect(set.text("p.md")).toBe("x!")
  expect(set.get("p.md")!.result).toEqual({ text: "x!", errors: [line("bang")], header: null })
  set.dispose()
})
