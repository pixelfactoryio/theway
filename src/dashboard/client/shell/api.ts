/** The write token of this page's response, which every request that is not a read carries. */
const token = (): string => document.querySelector<HTMLMetaElement>('meta[name="theway-token"]')?.content ?? ""

/** theway's version, from this page's `theway-version` meta; `""` when absent. */
export const version = (): string => document.querySelector<HTMLMetaElement>('meta[name="theway-version"]')?.content ?? ""

/** In place of the server's `error` when a request got no JSON answer. */
export const NO_ANSWER = "The server did not answer."

/** A write's answer: its status and JSON body; `error` is the body's `error`, or `NO_ANSWER` without a JSON answer. */
export type Sent = { status: number; body: Record<string, unknown>; error: string }

/** Sends `body` as JSON with this page's Origin and token; a failed request answers status 0. */
export async function sendJson(method: "POST" | "PUT", path: string, body: unknown): Promise<Sent> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Theway-Token": token() },
      body: JSON.stringify(body),
    })
  } catch {
    return { status: 0, body: {}, error: NO_ANSWER }
  }
  const json: unknown = await res.json().catch(() => null)
  if (json === null || typeof json !== "object" || Array.isArray(json)) return { status: res.status, body: {}, error: NO_ANSWER }
  const record = json as Record<string, unknown>
  return { status: res.status, body: record, error: typeof record.error === "string" ? record.error : "" }
}
