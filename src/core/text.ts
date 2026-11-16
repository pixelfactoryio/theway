/** Text helpers with no `node:` import, shared by the CLI and the dashboard's client bundle. */
import { parse, YAMLParseError } from "yaml"

/** `s` with its newlines and carriage returns written as `\n` and `\r`, for an error line. */
export const escaped = (s: string): string => s.replaceAll("\n", "\\n").replaceAll("\r", "\\r")

/** Compares two strings by UTF-16 code units, as `Array.prototype.sort` does by default. */
export const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The YAML root of `text`, maps as `Map`, or the first line of the parser's error. */
export function parseYaml(text: string): { root: unknown } | { reason: string } {
  try {
    return { root: parse(text, { mapAsMap: true, logLevel: "error" }) }
  } catch (e) {
    const first = (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? ""
    const line = e instanceof YAMLParseError ? e.linePos?.[0].line : undefined
    const failing = line === undefined ? "" : (text.split("\n")[line - 1] ?? "")
    const hint = failing.includes("${{") ? "; quote a ${{ … }} reference written inside {…}" : ""
    return { reason: `invalid YAML: ${first.replace(/:$/, "")}${hint}` }
  }
}

/** The line of the YAML parser's error in `text`, `null` when it parses or the error gives none. */
export function yamlErrorLine(text: string): number | null {
  try {
    parse(text, { mapAsMap: true, logLevel: "error" })
    return null
  } catch (e) {
    return e instanceof YAMLParseError ? (e.linePos?.[0].line ?? null) : null
  }
}

/** The segments of a path such as `steps[0].with.x`: keys and list indexes, as far as they read. */
export function pathSegments(path: string): (string | number)[] {
  const out: (string | number)[] = []
  const re = /\[(\d+)\]|\.?([^.[\]]+)/y
  let m: RegExpExecArray | null
  while (re.lastIndex < path.length && (m = re.exec(path)) !== null)
    out.push(m[1] !== undefined ? Number(m[1]) : (m[2] as string))
  return out
}
