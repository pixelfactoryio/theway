/**
 * The words of the versions list (when a version was saved and what it changed) and the rows of the diff between two
 * texts. Pure: no DOM, no React.
 */
import { structuredPatch } from "diff";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** An ISO time in local time: `Today, HH:MM:SS` for today, else `D MMM, HH:MM:SS`, on a 24-hour clock. */
export function whenOf(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const today = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return today ? `Today, ${time}` : `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
}

/** The lines added and removed from one text to the next. */
export function lineDelta(from: string, to: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const h of structuredPatch("a", "b", from, to, "", "", { context: 0 }).hunks) {
    for (const l of h.lines) {
      if (l.startsWith("+")) added += 1;
      else if (l.startsWith("-")) removed += 1;
    }
  }
  return { added, removed };
}

/** A delta in words: `+N −M lines`, `no change` when both are 0. */
export const deltaText = ({ added, removed }: { added: number; removed: number }): string =>
  added === 0 && removed === 0 ? "no change" : `+${added} −${removed} ${added + removed === 1 ? "line" : "lines"}`;

/**
 * The notes of the versions list. `texts` are the kept versions' texts, newest first (`undefined` while one loads):
 * each one's note is its delta from the version before it, the oldest's from an empty file. Current's note is its delta
 * from the newest version, only when it differs from it (none when equal, or with no kept version). A note is
 * `undefined` while a text it needs is not loaded.
 */
export function versionNotes(current: string | undefined, texts: (string | undefined)[]): { current: string | undefined; versions: (string | undefined)[] } {
  const note = (from: string | undefined, to: string | undefined) => (from === undefined || to === undefined ? undefined : deltaText(lineDelta(from, to)));
  const versions = texts.map((t, i) => note(i === texts.length - 1 ? "" : texts[i + 1], t));
  const newest = texts[0];
  const differs = texts.length > 0 && current !== undefined && newest !== undefined && current !== newest;
  return { current: differs ? note(newest, current) : undefined, versions };
}

/** A row of the diff: a line with its old and new numbers (`null` on the side it is not on), or the gap between two hunks. */
export type DiffRow = { old: number | null; new: number | null; text: string } | { gap: true };

/**
 * The rows of the diff from one text to another, with 3 context lines: each line as `structuredPatch` gives it (its
 * sign, then its text), numbered from its hunk's start on each side it is on; one gap between two hunks. A `\` line
 * (no newline at end of file) carries no number.
 */
export function diffRows(from: string, to: string): DiffRow[] {
  const rows: DiffRow[] = [];
  structuredPatch("a", "b", from, to, "", "", { context: 3 }).hunks.forEach((h, i) => {
    if (i > 0) rows.push({ gap: true });
    let o = h.oldStart;
    let n = h.newStart;
    for (const text of h.lines) {
      if (text.startsWith("-")) rows.push({ old: o++, new: null, text });
      else if (text.startsWith("+")) rows.push({ old: null, new: n++, text });
      else if (text.startsWith("\\")) rows.push({ old: null, new: null, text });
      else rows.push({ old: o++, new: n++, text });
    }
  });
  return rows;
}
