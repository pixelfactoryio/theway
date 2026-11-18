import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { z } from "zod"
import {
  ChangeDetailSchema,
  ChangeListSchema,
  CheckBodySchema,
  ConflictBodySchema,
  FileBodySchema,
  ProjectListSchema,
  PromptListSchema,
  SavedSchema,
  VersionListSchema,
  VersionTextSchema,
  WorkflowListSchema,
} from "../src/dashboard/contract"
import { createApp } from "../src/dashboard/server"
import { put } from "./helpers"

const TOKEN = "ef".repeat(32)
const PORT = 4870
const ORIGIN = `http://127.0.0.1:${PORT}`
const KEY = "-p"
const temps: string[] = []

afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

const REVIEW = `---
description: Review the change
model: opus
inputs:
  change:
    description: The change
    required: true
---

Review \${{ inputs.change }}
`

const AGENTS = `version: theway.workflow/v1beta1
description: Review a change
runs-on: agents
inputs:
  change:
    description: The change
    required: true
steps:
  - uses: prompts/review.md
    with:
      change: \${{ inputs.change }}
`

const yaml = (description: string, done: boolean[]): string =>
  `version: theway.change/v1beta1\ndescription: ${description}\ntasks:\n${done.map((d, i) => `  - text: Task ${i + 1}\n    done: ${d}\n`).join("")}`

/**
 * A temporary home with one project (`-p`) holding an active series member with a spec, an archived member of the same
 * series and an archived change, the global prompt `review` and the global workflow `agents` that uses it.
 */
function home(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "theway-contract-")))
  temps.push(dir)
  const changes = join(dir, "projects", KEY, "changes")
  put(join(changes, "add-x-02", "change.yaml"), yaml("Second", [true, false]))
  put(join(changes, "add-x-02", "spec.md"), "# Spec\n")
  put(join(changes, "archive", "2026-01-01-add-x-01", "change.yaml"), yaml("First", [true]))
  put(join(changes, "archive", "2026-01-02-add-y", "change.yaml"), yaml("Why", [true]))
  put(join(dir, "prompts", "review.md"), REVIEW)
  put(join(dir, "workflows", "agents.yaml"), AGENTS)
  return dir
}

const sha = (text: string): string => createHash("sha256").update(text).digest("hex")

/** A request as the page sends it: this server's Origin and the page's token; its status and parsed body. */
async function send(
  h: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const init: RequestInit = {
    method,
    headers: {
      Host: `127.0.0.1:${PORT}`,
      Origin: ORIGIN,
      "X-Theway-Token": TOKEN,
      "Content-Type": "application/json",
    },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await createApp(h, () => PORT, "", TOKEN).request(`${ORIGIN}${path}`, init)
  return { status: res.status, body: await res.json() }
}

/** `send`'s body, failing unless the answer is 200. */
async function call(h: string, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await send(h, method, path, body)
  expect([path, res.status]).toEqual([path, 200])
  return res.body
}

/** The answer parsed with `schema`, failing with zod's issues when it does not parse. */
function parsed<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body)
  expect(result.error?.issues).toBeUndefined()
  return result.data as z.infer<S>
}

test("GET /api/projects parses with ProjectListSchema", async () => {
  const body = parsed(ProjectListSchema, await call(home(), "GET", "/api/projects"))
  expect(body.projects.map((p) => p.key)).toEqual([KEY])
})

test("GET …/changes parses with ChangeListSchema", async () => {
  const body = parsed(ChangeListSchema, await call(home(), "GET", `/api/projects/${KEY}/changes`))
  expect(body.active.map((c) => c.id)).toEqual(["add-x-02"])
  expect(body.archived.map((c) => c.id)).toEqual(["add-y", "add-x-01"])
})

test("GET …/changes/:id of an active series member parses with ChangeDetailSchema", async () => {
  const body = parsed(ChangeDetailSchema, await call(home(), "GET", `/api/projects/${KEY}/changes/add-x-02`))
  expect(body.changeFile?.version).toBe(sha(yaml("Second", [true, false])))
  expect(body.files.map((f) => [f.name, typeof f.version])).toEqual([["spec.md", "string"]])
  expect(body.series?.members.map((m) => m.status)).toEqual(["archived", "in-progress"])
})

test("GET …/changes/archive/:dir parses with ChangeDetailSchema", async () => {
  const body = parsed(
    ChangeDetailSchema,
    await call(home(), "GET", `/api/projects/${KEY}/changes/archive/2026-01-02-add-y`),
  )
  expect([body.archived, body.status, body.series]).toEqual(["2026-01-02", "archived", null])
})

test("GET /api/workflows parses with WorkflowListSchema", async () => {
  const body = parsed(WorkflowListSchema, await call(home(), "GET", "/api/workflows"))
  expect(body.workflows.map((w) => [w.name, w.runsOn])).toEqual([["agents", "agents"]])
})

test("GET /api/prompts parses with PromptListSchema", async () => {
  const body = parsed(PromptListSchema, await call(home(), "GET", "/api/prompts"))
  expect(body.prompts.map((p) => [p.name, p.inputs.length, p.usedBy.length])).toEqual([["review", 1, 1]])
})

test("a workflow file parses with FileBodySchema", async () => {
  const body = parsed(FileBodySchema, await call(home(), "GET", "/api/workflows/global/agents"))
  expect([body.text, body.usedBy]).toEqual([AGENTS, undefined])
})

test("a prompt file with its uses parses with FileBodySchema", async () => {
  const body = parsed(FileBodySchema, await call(home(), "GET", "/api/prompts/global/review"))
  expect(body.usedBy?.map((u) => [u.workflow, u.as])).toEqual([["agents", "step"]])
})

test("POST /api/check of a workflow and of a prompt parses with CheckBodySchema", async () => {
  const h = home()
  const flow = parsed(
    CheckBodySchema,
    await call(h, "POST", "/api/check", { kind: "workflows", project: null, name: "agents", text: AGENTS }),
  )
  expect(flow.header).toBeUndefined()
  const prompt = parsed(
    CheckBodySchema,
    await call(h, "POST", "/api/check", { kind: "prompts", project: null, name: "review", text: REVIEW }),
  )
  expect([prompt.header, prompt.model, prompt.inputs?.length]).toEqual([true, "opus", 1])
})

test("a save, the history list and a version parse with SavedSchema, VersionListSchema and VersionTextSchema", async () => {
  const h = home()
  const next = REVIEW.replace("Review the change", "Review it")
  const saved = parsed(
    SavedSchema,
    await call(h, "PUT", "/api/prompts/global/review", { text: next, base: sha(REVIEW) }),
  )
  expect(saved.version).toBe(sha(next))
  const list = parsed(VersionListSchema, await call(h, "GET", "/api/prompts/global/review/history"))
  expect(list.versions.length).toBe(1)
  const version = parsed(
    VersionTextSchema,
    await call(h, "GET", `/api/prompts/global/review/history/${list.versions[0]?.id}`),
  )
  expect(version.text).toBe(REVIEW)
})

test("a PUT with a stale base answers 409 and parses with ConflictBodySchema", async () => {
  const res = await send(home(), "PUT", "/api/prompts/global/review", { text: "x\n", base: sha("stale") })
  expect(res.status).toBe(409)
  expect(parsed(ConflictBodySchema, res.body)).toEqual({ error: "changed on disk", version: sha(REVIEW) })
})

test("creating a file that exists answers 409 file exists and parses with ConflictBodySchema", async () => {
  const res = await send(home(), "PUT", "/api/prompts/global/review", { text: "x\n", base: null })
  expect(res.status).toBe(409)
  expect(parsed(ConflictBodySchema, res.body)).toEqual({ error: "file exists", version: sha(REVIEW) })
})
