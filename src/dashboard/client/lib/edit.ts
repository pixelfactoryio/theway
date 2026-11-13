/** Editing a workflow or prompt file: the page an address is on, the times shown, and a new file's text. Pure: no React, no DOM. */
import { stringify } from "yaml";

/** The file a file page shows: its kind, its project (`null`: global) and its name. */
export type FilePageId = { kind: "workflows" | "prompts"; project: string | null; name: string };

/** A file page's address path: `/<kind>/global/<name>[/<tab>]` or `/<kind>/projects/<key>/<name>[/<tab>]`. */
const FILE_PAGE = /^\/(workflows|prompts)\/(?:global\/([^/?]+)|projects\/([^/?]+)\/([^/?]+))(?:\/[^/?]*)?\/?$/;

/** The file page of an address path (the part before any `?`), `null` for any other page. */
export function filePageOf(path: string): FilePageId | null {
  const m = FILE_PAGE.exec(path.split("?")[0] as string);
  if (m === null) return null;
  if (m[2] !== undefined) return { kind: m[1] as FilePageId["kind"], project: null, name: m[2] };
  return { kind: m[1] as FilePageId["kind"], project: m[3] as string, name: m[4] as string };
}

/**
 * Whether going to `target` (an address path, with or without its search part) leaves the page of `page`: its kind,
 * its `global` or `projects/<key>` part, or its name differs. Another tab of the same file, or another search part,
 * does not leave.
 */
export function leavesPage(page: FilePageId, target: string): boolean {
  const to = filePageOf(target);
  return to === null || to.kind !== page.kind || to.project !== page.project || to.name !== page.name;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** A time as `YYYY-MM-DD HH:MM:SS` in the browser's local time zone. */
export function localTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** A file's name: lowercase letters and digits, in words joined by single hyphens. */
export const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A text value as the `yaml` package's `stringify` writes it alone with `lineWidth: 0`, without its final line break. */
export const yamlValue = (value: string): string => stringify(value, { lineWidth: 0 }).replace(/\n$/, "");

/** The text an Empty new file starts with. */
export function emptyText(kind: "workflows" | "prompts", description: string): string {
  const d = yamlValue(description);
  if (kind === "workflows") return `version: theway.workflow/v1beta\ndescription: ${d}\nruns-on: agents\nsteps: []\n`;
  return `---\ndescription: ${d}\nmodel: opus\n---\n`;
}

/** The line `Save with N errors?` (`1 error`). */
export const saveWithErrors = (n: number): string => `Save with ${n === 1 ? "1 error" : `${n} errors`}?`;

/** A line count of the versions list: `+N −M lines`. */
export const lineCounts = (added: number, removed: number): string => `+${added} −${removed} lines`;
