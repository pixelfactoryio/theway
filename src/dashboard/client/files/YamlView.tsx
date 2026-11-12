/**
 * The YAML view of a workflow: its draft's text in a code editor that marks each error on its line, and above it the
 * check's errors, each line of the open file with the line of the text it points at, as a button that selects that line.
 */
import { type ReactNode, useRef } from "react";
import { marksOf, shownError } from "@/lib/workflows";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";

/** The code editor on the draft's text, and above it the error box, then `warnings`. */
export function YamlView({
  name,
  text,
  errors,
  warnings,
  onText,
  onUndo,
  onRedo,
}: {
  name: string;
  text: string;
  errors: readonly string[];
  warnings: ReactNode;
  onText: (text: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const editor = useRef<CodeEditorHandle>(null);
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
                    onClick={() => e.line !== null && editor.current?.selectLine(e.line)}
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
      <CodeEditor
        ref={editor}
        value={text}
        onChange={onText}
        onUndo={onUndo}
        onRedo={onRedo}
        language="yaml"
        marks={marksOf(errors, name, text)}
        label={`workflows/${name}.yaml`}
        className="min-h-[60vh]"
      />
    </div>
  );
}
