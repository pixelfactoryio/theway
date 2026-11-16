/** Helpers shared by the test files. */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

/** Writes `text` to `path`, creating its folders. */
export function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

/** A string escaped for use inside a regular expression. */
export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** The token a dashboard app's page carries in its `<meta name="theway-token">`, the app answering on `port`. */
export async function pageToken(
  app: { request: (url: string, init: RequestInit) => Response | Promise<Response> },
  port: number,
): Promise<string> {
  const res = await app.request(`http://127.0.0.1:${port}/`, { headers: { Host: `127.0.0.1:${port}` } })
  return /<meta name="theway-token" content="([^"]+)">/.exec(await res.text())?.[1] as string
}
