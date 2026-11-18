import type { z } from "zod"

import { ErrorBodySchema } from "@/lib/files"

/** The content of this page's `theway-<name>` meta; `""` when absent. */
export const meta = (name: "token" | "version" | "nonce"): string =>
  document.querySelector<HTMLMetaElement>(`meta[name="theway-${name}"]`)?.content ?? ""

/** The write token of this page's response, which every request that is not a read carries. */
const token = (): string => meta("token")

/** theway's version, from this page's `theway-version` meta; `""` when absent. */
export const version = (): string => meta("version")

/** In place of the server's `error` when a request got no JSON answer. */
export const NO_ANSWER = "The server did not answer."

/** The error of an answer that does not parse with its schema: the path, then where and what its first issue is. */
export function unexpectedAnswer(path: string, error: z.ZodError): string {
  const issue = error.issues[0]
  const where = issue.path.length === 0 ? "(root)" : issue.path.map(String).join(".")
  return `${path}: unexpected answer: ${where}: ${issue.message}`
}

/**
 * A write's answer: its status, the 200 body parsed with the write's schema (`null` otherwise) and `error`: for a 200,
 * `""` or the parse failure; else the answer's `error`, `""` without one, or `NO_ANSWER` without a JSON answer.
 */
type Sent<T> = { status: number; body: T | null; error: string }

/** A failed write's text: its `error`, else its status. */
export const failureOf = (res: Sent<unknown>): string => (res.error !== "" ? res.error : `${res.status}`)

/** Sends `body` as JSON with this page's Origin and token, and parses a 200 with `schema`; a failed request answers status 0. */
export async function sendJson<S extends z.ZodType>(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  schema: S,
): Promise<Sent<z.infer<S>>> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Theway-Token": token() },
      body: JSON.stringify(body),
    })
  } catch {
    return { status: 0, body: null, error: NO_ANSWER }
  }
  const json: unknown = await res.json().catch(() => null)
  if (res.status === 200) {
    const parsed = schema.safeParse(json)
    return parsed.success
      ? { status: 200, body: parsed.data, error: "" }
      : { status: 200, body: null, error: unexpectedAnswer(path, parsed.error) }
  }
  if (json === null || typeof json !== "object" || Array.isArray(json))
    return { status: res.status, body: null, error: NO_ANSWER }
  const failure = ErrorBodySchema.safeParse(json)
  return { status: res.status, body: null, error: failure.success ? failure.data.error : "" }
}
