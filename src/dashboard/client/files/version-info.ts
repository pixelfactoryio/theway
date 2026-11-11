/** The words of the versions list: when a version was saved and what it changed. Pure: no DOM, no React. */
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
