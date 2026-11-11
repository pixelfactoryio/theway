/**
 * The YAML view of a workflow: its draft's text in a text box, and above it the check's errors, each line of the open
 * file with the line of the text it points at, as a button that selects that line.
 */
import { type ReactNode, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { splitErrorLine } from "@/lib/workflows";
import { lineOf, lineOfMessage } from "../editor/lines";

/** An error line as the YAML view shows it: its text, and the line of the text it points at (`null` for none). */
export function shownError(line: string, name: string, text: string): { line: number | null; text: string } {
  const split = splitErrorLine(line, name);
  if (!split.own) return { line: null, text: line };
  if (split.where !== null) return { line: lineOf(text, split.where), text: `${split.where}: ${split.message}` };
  if (split.message.startsWith("invalid YAML:")) return { line: lineOfMessage(split.message), text: split.message };
  return { line: null, text: split.message };
}

/** Focuses `box`, selects its line `n` (from 1) and scrolls it into view. */
function selectLine(box: HTMLTextAreaElement, n: number): void {
  const lines = box.value.split("\n");
  const index = Math.min(Math.max(n, 1), lines.length) - 1;
  const start = lines.slice(0, index).reduce((sum, l) => sum + l.length + 1, 0);
  box.focus();
  box.setSelectionRange(start, start + (lines[index] ?? "").length);
  const style = getComputedStyle(box);
  const height = Number.parseFloat(style.lineHeight) || 20;
  const top = Number.parseFloat(style.paddingTop) + index * height;
  if (box.scrollHeight > box.clientHeight) box.scrollTop = Math.max(0, top - box.clientHeight / 2);
  const y = box.getBoundingClientRect().top + top - box.scrollTop;
  if (y < 0 || y > innerHeight - height) scrollBy({ top: y - innerHeight / 3 });
}

/** The text box on the draft's text, and above it the error box, then `warnings`. */
export function YamlView({
  name,
  text,
  errors,
  warnings,
  onText,
}: {
  name: string;
  text: string;
  errors: readonly string[];
  warnings: ReactNode;
  onText: (text: string) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  // Keeps what is typed while the draft's text is that text, and shows the draft's otherwise, as on undo.
  const [typed, setTyped] = useState(text);
  const [seen, setSeen] = useState(text);
  if (seen !== text) {
    setSeen(text);
    if (typed !== text) setTyped(text);
  }
  const shown = errors.map((l) => shownError(l, name, text));
  return (
    <div className="flex flex-1 flex-col gap-3">
      {shown.length > 0 && (
        <ul className="flex flex-col gap-0.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-[13px] break-words text-destructive">
          {shown.map((e, i) => (
            <li key={`${i}:${e.text}`}>
              {e.line !== null && (
                <>
                  <button
                    type="button"
                    className="cursor-pointer font-medium underline underline-offset-2"
                    onClick={() => box.current !== null && e.line !== null && selectLine(box.current, e.line)}
                  >
                    line {e.line}
                  </button>
                  {" · "}
                </>
              )}
              {e.text}
            </li>
          ))}
        </ul>
      )}
      {warnings}
      <Textarea
        ref={box}
        aria-label={`workflows/${name}.yaml`}
        className="min-h-[70vh] flex-1 bg-card font-mono text-[13px] md:text-[13px]"
        spellCheck={false}
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          onText(e.target.value);
        }}
      />
    </div>
  );
}
