import { afterEach, expect, test } from "bun:test"
import { QueryClient, type QueryKey } from "@tanstack/react-query"
import { DashboardSettingsSchema } from "../src/dashboard/contract"
import { failureOf, sendJson } from "../src/dashboard/client/data/api"
import { apiPath, type DashboardSettings, NO_SETTINGS, queryKeys, writes } from "../src/dashboard/client/data/queries"

const realFetch = globalThis.fetch
const realDocument = (globalThis as { document?: unknown }).document

/** Makes every `fetch` answer `status` with `body` as JSON, and returns the requests it got. */
function answer(status: number, body: unknown): { path: string; method: string; body: unknown }[] {
  const calls: { path: string; method: string; body: unknown }[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ path: String(input), method: init?.method ?? "GET", body: JSON.parse(String(init?.body ?? "null")) })
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch
  return calls
}

/** A page with no token meta: `bun test` has no `document`, and `sendJson` reads the page's token through it. */
function page(): void {
  ;(globalThis as { document?: unknown }).document = { querySelector: () => null }
}

/** A real query client whose `invalidateQueries` is spied on: `invalidated` holds each key it was called with. */
function spied(): { client: QueryClient; invalidated: QueryKey[] } {
  const client = new QueryClient()
  const invalidated: QueryKey[] = []
  const real = client.invalidateQueries.bind(client)
  client.invalidateQueries = ((filters, options) => {
    invalidated.push(filters?.queryKey as QueryKey)
    return real(filters, options)
  }) as typeof client.invalidateQueries
  return { client, invalidated }
}

afterEach(() => {
  globalThis.fetch = realFetch
  ;(globalThis as { document?: unknown }).document = realDocument
})

const FILE = apiPath.file("prompts", "-p", "review")

/** Each write other than `editSettings`: its call, its request, a body its schema accepts, and the keys it refreshes. */
const WRITES: {
  name: string
  run: (w: ReturnType<typeof writes>) => Promise<{ status: number }>
  method: string
  path: string
  sent: unknown
  ok: unknown
  keys: QueryKey[]
}[] = [
  {
    name: "checkFile",
    run: (w) => w.checkFile("prompts", "-p", "review", "t"),
    method: "POST",
    path: "/api/check",
    sent: { kind: "prompts", project: "-p", name: "review", text: "t" },
    ok: { errors: [] },
    keys: [],
  },
  {
    name: "saveFile",
    run: (w) => w.saveFile("prompts", "-p", "review", "t", "v1"),
    method: "PUT",
    path: "/api/prompts/projects/-p/review",
    sent: { text: "t", base: "v1" },
    ok: { version: "v2" },
    keys: [["workflows"], ["prompts"], ["history", FILE], ["file", FILE]],
  },
  {
    name: "createFile",
    run: (w) => w.createFile("workflows", null, "ship", "t"),
    method: "PUT",
    path: "/api/workflows/global/ship",
    sent: { text: "t", base: null },
    ok: { version: "v1" },
    keys: [["workflows"], ["prompts"]],
  },
  {
    name: "restoreFile",
    run: (w) => w.restoreFile("prompts", "-p", "review", "20260101T000000000Z-0123456789ab", "v1"),
    method: "POST",
    path: "/api/prompts/projects/-p/review/history/20260101T000000000Z-0123456789ab/restore",
    sent: { base: "v1" },
    ok: { version: "v2" },
    keys: [["workflows"], ["prompts"], ["history", FILE], ["file", FILE]],
  },
  {
    name: "saveChangeFile",
    run: (w) => w.saveChangeFile("-p", "add-a", "spec.md", "t", "v1"),
    method: "PUT",
    path: "/api/projects/-p/changes/add-a/files/spec.md",
    sent: { text: "t", base: "v1" },
    ok: { version: "v2" },
    keys: [["change", "/api/projects/-p/changes/add-a"], ["changes", "-p"], ["projects"]],
  },
]

test("each write sends its request and, on a 200 its schema accepts, invalidates exactly its keys", async () => {
  for (const w of WRITES) {
    const { client, invalidated } = spied()
    page()
    const calls = answer(200, w.ok)
    const res = await w.run(writes(client))
    expect([w.name, res.status]).toEqual([w.name, 200])
    expect([w.name, calls]).toEqual([w.name, [{ path: w.path, method: w.method, body: w.sent }]])
    expect([w.name, invalidated]).toEqual([w.name, w.keys])
    client.clear()
  }
})

test("each write invalidates nothing on a 409, a 500, or a 200 whose body fails its schema", async () => {
  for (const w of WRITES) {
    for (const [status, body] of [
      [409, { error: "changed on disk" }],
      [500, { error: "cannot be written" }],
      [200, { other: 1 }],
    ] as const) {
      const { client, invalidated } = spied()
      page()
      answer(status, body)
      const res = await w.run(writes(client))
      expect([w.name, status, res.status, invalidated]).toEqual([w.name, status, status, []])
      client.clear()
    }
  }
})

const SETTINGS: DashboardSettings = { pinned: ["project:-p"], groups: [], recent: [], dismissed: [] }

test("editSettings shows the edit at once and keeps the answer of a 200, invalidating nothing", async () => {
  const { client, invalidated } = spied()
  page()
  const calls = answer(200, SETTINGS)
  const done = writes(client).editSettings((now) => ({ ...now, pinned: ["project:-p"] }))
  expect(client.getQueryData(queryKeys.settings())).toEqual({ ...NO_SETTINGS, pinned: ["project:-p"] })
  await done
  expect(calls).toEqual([{ path: "/api/dashboard", method: "PUT", body: SETTINGS }])
  expect(client.getQueryData(queryKeys.settings())).toEqual(SETTINGS)
  expect(invalidated).toEqual([])
  client.clear()
})

test("editSettings on a 409, a 500 or a 200 whose body fails its schema invalidates the settings once and throws", async () => {
  for (const [status, body] of [
    [409, { error: "changed on disk" }],
    [500, { error: "cannot be written" }],
    [200, { other: 1 }],
  ] as const) {
    page()
    answer(status, body)
    const expected = failureOf(await sendJson("PUT", apiPath.dashboard, NO_SETTINGS, DashboardSettingsSchema))
    const { client, invalidated } = spied()
    const thrown = await writes(client)
      .editSettings((now) => now)
      .then(
        () => "",
        (e: unknown) => (e instanceof Error ? e.message : String(e)),
      )
    expect([status, thrown]).toEqual([status, expected])
    expect([status, invalidated]).toEqual([status, [queryKeys.settings()]])
    client.clear()
  }
})

test("the query keys and API paths", () => {
  expect([
    queryKeys.projects(),
    queryKeys.changes("-p"),
    queryKeys.change("/api/x"),
    queryKeys.workflows(),
    queryKeys.prompts(),
    queryKeys.file("/api/x"),
    queryKeys.history("/api/x"),
    queryKeys.version("/api/x", "1"),
    queryKeys.settings(),
  ]).toEqual([
    ["projects"],
    ["changes", "-p"],
    ["change", "/api/x"],
    ["workflows"],
    ["prompts"],
    ["file", "/api/x"],
    ["history", "/api/x"],
    ["version", "/api/x", "1"],
    ["dashboard-settings"],
  ])
  expect([
    apiPath.projects,
    apiPath.changes("-p"),
    apiPath.change("-p", "add-a"),
    apiPath.archived("-p", "2026-01-01-add-a"),
    apiPath.changeFile("-p", "add-a", "spec.md"),
    apiPath.workflows,
    apiPath.prompts,
    apiPath.file("workflows", null, "ship"),
    apiPath.file("prompts", "-p", "review"),
    apiPath.check,
    apiPath.history("prompts", null, "review"),
    apiPath.version("prompts", null, "review", "1"),
    apiPath.restore("prompts", null, "review", "1"),
    apiPath.dashboard,
  ]).toEqual([
    "/api/projects",
    "/api/projects/-p/changes",
    "/api/projects/-p/changes/add-a",
    "/api/projects/-p/changes/archive/2026-01-01-add-a",
    "/api/projects/-p/changes/add-a/files/spec.md",
    "/api/workflows",
    "/api/prompts",
    "/api/workflows/global/ship",
    "/api/prompts/projects/-p/review",
    "/api/check",
    "/api/prompts/global/review/history",
    "/api/prompts/global/review/history/1",
    "/api/prompts/global/review/history/1/restore",
    "/api/dashboard",
  ])
  expect(apiPath.changeFile("a b", "x/y", "a?b")).toBe("/api/projects/a%20b/changes/x%2Fy/files/a%3Fb")
})
