/** Editing a workflow or prompt file: the times shown, and a new file's text. Pure: no React, no DOM. */
import { stringify } from "yaml"
import { VERSION } from "../../../core/language-schema"
import { errorCount } from "./files"

const pad = (n: number, width = 2): string => String(n).padStart(width, "0")

/** A time as `YYYY-MM-DD HH:MM:SS` in the browser's local time zone. */
export function localTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** A file's name: lowercase letters and digits, in words joined by single hyphens. */
export { NAME } from "../../../core/language-schema"

/** A text value as the `yaml` package's `stringify` writes it alone with `lineWidth: 0`, without its final line break. */
export const yamlValue = (value: string): string => stringify(value, { lineWidth: 0 }).replace(/\n$/, "")

/** The text an Empty new file starts with. */
export function emptyText(kind: "workflows" | "prompts", description: string): string {
  const d = yamlValue(description)
  if (kind === "workflows") return `version: ${VERSION}\ndescription: ${d}\nruns-on: agents\nsteps: []\n`
  return `---\ndescription: ${d}\nmodel: opus\n---\n`
}

/** The line `Save with N errors?` (`1 error`). */
export const saveWithErrors = (n: number): string => `Save with ${errorCount(n)}?`

/** A line count of the versions list: `+N −M lines`. */
export const lineCounts = (added: number, removed: number): string => `+${added} −${removed} lines`
