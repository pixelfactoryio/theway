/** Editing a change on its page: the page an address is on, row ids, Markdown checkboxes and formatting. Pure: no React, no DOM. */

/** The active change a page shows: its project key and its ID. */
export type ChangePageId = { key: string; id: string };

/**
 * Whether going to `target` (an address path, with or without its search part) leaves the page of the change `page`:
 * another project, another change or another kind of page. Another tab of the same change, or another search part,
 * does not leave.
 */
export function leavesChange(page: ChangePageId, target: string): boolean {
  const path = (target.replace(/^#/, "").split("?")[0] as string).replace(/\/$/, "");
  const parts = path.split("/");
  if (parts.length < 4 || parts.length > 5 || parts[0] !== "") return true;
  return parts[1] !== page.key || parts[2] !== "changes" || parts[3] !== page.id;
}

/** The ids of `count` rows after a change of the draft that is not a list action: the first min(old, new) kept by position. */
export function keptIds(old: readonly string[], count: number, make: () => string): string[] {
  return Array.from({ length: count }, (_, i) => (i < old.length ? (old[i] as string) : make()));
}

/** `list` with the item at `from` moved to `to`, the list `arrayMove` gives. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item as T);
  return out;
}

/** A task row's accessible name: `Task N: <text>`, or `Task N, done: <text>`. */
export const taskName = (n: number, text: string, done: boolean): string => `Task ${n}${done ? ", done" : ""}: ${text}`;

/** A description as one line: each run of line breaks turned into one space. */
export const oneLine = (text: string): string => text.replace(/[\r\n]+/g, " ");

/** The title of a file's unsaved bar. */
export const unsavedTitle = (name: string): string => `Unsaved changes in ${name}`;

/**
 * The column (from 0) of the first `[ ]`, `[x]` or `[X]` of `line`, `-1` when it has none: what a Markdown task item's
 * checkbox flips on its first source line.
 */
export const taskBoxColumn = (line: string): number => line.search(/\[[ xX]\]/);

/** The text of a task box: `[x]` when checked, `[ ]` otherwise. */
export const taskBox = (checked: boolean): string => (checked ? "[x]" : "[ ]");

/** A selection's replacement: the range it replaces, the text put there, and the selection after. */
export type Replace = { from: number; to: number; insert: string; anchor: number; head: number };

/**
 * Bold, Italic or Code on the text `doc` selected from `from` to `to`: an empty selection gets the pair with the cursor
 * between; a selection already wrapped in `marker`, inside it or around it, loses the markers; any other is wrapped.
 */
export function wrapped(doc: string, from: number, to: number, marker: string): Replace {
  const m = marker.length;
  const selected = doc.slice(from, to);
  if (from === to) return { from, to, insert: marker + marker, anchor: from + m, head: from + m };
  if (selected.length >= 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(m, -m);
    return { from, to, insert: inner, anchor: from, head: from + inner.length };
  }
  if (doc.slice(from - m, from) === marker && doc.slice(to, to + m) === marker) {
    return { from: from - m, to: to + m, insert: selected, anchor: from - m, head: to - m };
  }
  return { from, to, insert: marker + selected + marker, anchor: from + m, head: to + m };
}

/** Link on the text selected from `from` to `to`: `[text](https://)`, the link text selected; `[](https://)` with the cursor in the brackets. */
export function linked(doc: string, from: number, to: number): Replace {
  const selected = doc.slice(from, to);
  return { from, to, insert: `[${selected}](https://)`, anchor: from + 1, head: from + 1 + selected.length };
}

/** The line prefixes of the toolbar. */
export type LinePrefix = "heading" | "bullet" | "numbered" | "task";

const PREFIX: Record<Exclude<LinePrefix, "numbered">, string> = { heading: "## ", bullet: "- ", task: "- [ ] " };
const NUMBERED = /^\d+\. /;

const hasPrefix = (line: string, kind: LinePrefix): boolean =>
  kind === "numbered" ? NUMBERED.test(line) : line.startsWith(PREFIX[kind]);

/**
 * The selected lines with a prefix toggled: removed from every line when all of them have it, otherwise added to the
 * lines that lack it. A numbered line's prefix is any `<digits>. `; one added is the line's number in the selection.
 */
export function prefixed(lines: readonly string[], kind: LinePrefix): string[] {
  const all = lines.every((l) => hasPrefix(l, kind));
  return lines.map((line, i) => {
    if (all) return kind === "numbered" ? line.replace(NUMBERED, "") : line.slice(PREFIX[kind].length);
    if (hasPrefix(line, kind)) return line;
    return (kind === "numbered" ? `${i + 1}. ` : PREFIX[kind]) + line;
  });
}

/** The index of the block that holds `line`: the last of `lines` (each block's first line, in document order) at or before it. */
export function blockAt(lines: readonly number[], line: number): number {
  let found = -1;
  lines.forEach((l, i) => {
    if (l <= line) found = i;
  });
  return found;
}

/** A toolbar tooltip: `<label> (⌘B)` on macOS, `<label> (Ctrl+B)` elsewhere. */
export const shortcutTip = (label: string, key: string, mac: boolean): string => `${label} (${mac ? `⌘${key}` : `Ctrl+${key}`})`;
