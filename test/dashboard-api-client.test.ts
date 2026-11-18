import { afterEach, expect, test } from "bun:test"
import { SavedSchema, VersionTextSchema } from "../src/dashboard/client/lib/files"
import { getJson, NO_ANSWER, sendJson } from "../src/dashboard/client/data/api"

/** zod's message for a required string that is missing. */
const MISSING_STRING = "Invalid input: expected string, received undefined"

const realFetch = globalThis.fetch
const realDocument = (globalThis as { document?: unknown }).document

/** Makes every `fetch` answer `status` with `body` as JSON, and returns the requests it got. */
function answer(status: number, body: unknown): { path: string; init: RequestInit | undefined }[] {
  const calls: { path: string; init: RequestInit | undefined }[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ path: String(input), init })
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch
  return calls
}

/** The message `p` rejects with, `""` when it resolves. */
const failure = (p: Promise<unknown>): Promise<string> =>
  p.then(
    () => "",
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  )

/** A page with no token meta: `bun test` has no `document`, and `sendJson` reads the page's token through it. */
function page(): void {
  ;(globalThis as { document?: unknown }).document = { querySelector: () => null }
}

afterEach(() => {
  globalThis.fetch = realFetch
  ;(globalThis as { document?: unknown }).document = realDocument
})

test("getJson returns an answer its schema parses", async () => {
  const calls = answer(200, { text: "v1" })
  expect(await getJson("/api/prompts/global/review/history/1", VersionTextSchema)).toEqual({ text: "v1" })
  expect(calls.map((c) => c.path)).toEqual(["/api/prompts/global/review/history/1"])
})

test("getJson throws the path, the field and zod's message for a 2xx answer missing a field", async () => {
  answer(200, { other: 1 })
  expect(await failure(getJson("/api/prompts/global/review/history/1", VersionTextSchema))).toBe(
    `/api/prompts/global/review/history/1: unexpected answer: text: ${MISSING_STRING}`,
  )
})

test("getJson names the root when the answer is not an object", async () => {
  answer(200, null)
  expect(await failure(getJson("/api/x", VersionTextSchema))).toMatch(/^\/api\/x: unexpected answer: \(root\): /)
})

test("getJson throws the error text of a 404", async () => {
  answer(404, { error: "unknown file" })
  expect(await failure(getJson("/api/prompts/global/nope", VersionTextSchema))).toBe("unknown file")
})

test("sendJson returns a 200 answer its schema parses", async () => {
  page()
  const calls = answer(200, { version: "abc" })
  expect(await sendJson("PUT", "/api/workflows/global/agents", { text: "x", base: null }, SavedSchema)).toEqual({
    status: 200,
    body: { version: "abc" },
    error: "",
  })
  expect(calls[0]?.init?.method).toBe("PUT")
})

test("sendJson gives no body and the unexpected-answer error for a 200 its schema does not parse", async () => {
  page()
  answer(200, {})
  expect(await sendJson("PUT", "/api/workflows/global/agents", { text: "x", base: null }, SavedSchema)).toEqual({
    status: 200,
    body: null,
    error: `/api/workflows/global/agents: unexpected answer: version: ${MISSING_STRING}`,
  })
})

test("sendJson gives no body and the answer's error for a 409", async () => {
  page()
  answer(409, { error: "changed on disk", version: "def" })
  expect(await sendJson("PUT", "/api/workflows/global/agents", { text: "x", base: "abc" }, SavedSchema)).toEqual({
    status: 409,
    body: null,
    error: "changed on disk",
  })
})

test("sendJson gives no body and an empty error for a 500 JSON object with no error", async () => {
  page()
  answer(500, {})
  expect(await sendJson("PUT", "/api/workflows/global/agents", { text: "x", base: null }, SavedSchema)).toEqual({
    status: 500,
    body: null,
    error: "",
  })
})

test("sendJson gives status 0 and NO_ANSWER when the request fails", async () => {
  page()
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch")
  }) as unknown as typeof fetch
  expect(await sendJson("POST", "/api/check", {}, SavedSchema)).toEqual({ status: 0, body: null, error: NO_ANSWER })
})
