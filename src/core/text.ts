/** Text helpers with no `node:` import, shared by the CLI and the dashboard's client bundle. */
import { parse } from "yaml";

/** `s` with its newlines and carriage returns written as `\n` and `\r`, for an error line. */
export const escaped = (s: string): string => s.replaceAll("\n", "\\n").replaceAll("\r", "\\r");

/** The YAML root of `text`, maps as `Map`, or the first line of the parser's error. */
export function parseYaml(text: string): { root: unknown } | { reason: string } {
  try {
    return { root: parse(text, { mapAsMap: true, logLevel: "error" }) };
  } catch (e) {
    const first = (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "";
    const line = (e as { linePos?: { line: number }[] }).linePos?.[0]?.line;
    const failing = line === undefined ? "" : (text.split("\n")[line - 1] ?? "");
    const hint = failing.includes("${{") ? "; quote a ${{ … }} reference written inside {…}" : "";
    return { reason: `invalid YAML: ${first.replace(/:$/, "")}${hint}` };
  }
}

/** The line of the YAML parser's error in `text`, `null` when it parses or the error gives none. */
export function yamlErrorLine(text: string): number | null {
  try {
    parse(text, { mapAsMap: true, logLevel: "error" });
    return null;
  } catch (e) {
    return (e as { linePos?: { line: number }[] }).linePos?.[0]?.line ?? null;
  }
}
