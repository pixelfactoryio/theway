/**
 * A code editor (CodeMirror 6) on a file's text: line numbers, syntax colours and error marks. Its undo history is the
 * draft's: the editor's undo keys and the browser's undo and redo input run `onUndo` and `onRedo`, and every text that
 * comes from outside (an undo, a Restore, an edit made elsewhere) replaces the editor's state.
 */
import { yaml, yamlFrontmatter } from "@codemirror/lang-yaml";
import { markdown } from "@codemirror/lang-markdown";
import { type Diagnostic, setDiagnostics } from "@codemirror/lint";
import { Compartment, EditorState, type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { cn } from "cn";
import { type Ref, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { styleNonce } from "@/lib/api";

/** An error mark on a line (from 1). */
export type Mark = { line: number; message: string };

/** What the editor's ref gives. */
export type CodeEditorHandle = { selectLine: (n: number) => void };

/** Whether every line break of `text` is `\r\n`, with at least one. */
const allCrlf = (text: string): boolean => text.includes("\r\n") && !/(^|[^\r])\n/.test(text) && !/\r(?!\n)/.test(text);

/** `text` with every line break as `\n`, as `doc.toString()` joins it. */
const withLf = (text: string): string => text.replace(/\r\n?/g, "\n");

/** The diagnostics of `marks` in `state`: each an error over its whole line; a line past the last is dropped. */
function diagnostics(state: EditorState, marks: readonly Mark[]): Diagnostic[] {
  return marks
    .filter((m) => m.line >= 1 && m.line <= state.doc.lines)
    .map((m) => {
      const line = state.doc.line(m.line);
      return { from: line.from, to: line.to, severity: "error", message: m.message };
    });
}

const NO_MARKS: readonly Mark[] = [];

export function CodeEditor({
  value,
  onChange,
  onUndo,
  onRedo,
  language,
  marks = NO_MARKS,
  label,
  className,
  ref,
}: {
  value: string;
  onChange: (text: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  language: "yaml" | "prompt";
  marks?: readonly Mark[];
  label: string;
  className?: string;
  ref?: Ref<CodeEditorHandle>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  /** The extensions of a state holding a text, set by the view's effect: they depend on the text's line ends. */
  const extensionsOf = useRef<((text: string) => Extension[]) | null>(null);
  const latest = useRef({ value, onChange, onUndo, onRedo, marks, label });
  latest.current = { value, onChange, onUndo, onRedo, marks, label };
  const labelled = useRef(new Compartment());

  useEffect(() => {
    const parent = host.current;
    if (parent === null) return;
    const lang = language === "yaml" ? yaml() : yamlFrontmatter({ content: markdown() });
    const keys = Prec.high(
      keymap.of([
        { key: "Mod-z", run: () => (latest.current.onUndo(), true), preventDefault: true },
        { key: "Mod-Shift-z", run: () => (latest.current.onRedo(), true), preventDefault: true },
        { key: "Mod-y", run: () => (latest.current.onRedo(), true), preventDefault: true },
        // `basicSetup`'s history keys undo and redo text with the selection: the draft's history is the only one.
        { key: "Mod-u", run: () => true, preventDefault: true },
        { key: "Alt-u", mac: "Mod-Shift-u", run: () => true, preventDefault: true },
      ]),
    );
    const input = Prec.high(
      EditorView.domEventHandlers({
        beforeinput: (e) => {
          if (e.inputType === "historyUndo") {
            e.preventDefault();
            latest.current.onUndo();
            return true;
          }
          if (e.inputType === "historyRedo") {
            e.preventDefault();
            latest.current.onRedo();
            return true;
          }
          return false;
        },
      }),
    );
    const listener = EditorView.updateListener.of((u) => {
      if (u.docChanged) latest.current.onChange(u.state.sliceDoc());
    });
    extensionsOf.current = (text) => [
      basicSetup,
      EditorView.lineWrapping,
      EditorView.cspNonce.of(styleNonce()),
      lang,
      keys,
      input,
      listener,
      labelled.current.of(EditorView.contentAttributes.of({ "aria-label": latest.current.label })),
      ...(allCrlf(text)
        ? [EditorState.lineSeparator.of("\r\n"), EditorView.clipboardInputFilter.of((pasted) => pasted.replace(/\r\n|\r|\n/g, "\r\n"))]
        : []),
    ];
    const text = latest.current.value;
    const v = new EditorView({ parent, state: EditorState.create({ doc: text, extensions: extensionsOf.current(text) }) });
    v.dispatch(setDiagnostics(v.state, diagnostics(v.state, latest.current.marks)));
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, [language]);

  // An outside change replaces the state: no transaction, so the update listener does not echo it through `onChange`.
  useLayoutEffect(() => {
    const v = view.current;
    const extensions = extensionsOf.current;
    if (v === null || extensions === null) return;
    const lf = withLf(value);
    // Equal texts with another separator still replace it, or the next keystroke would rewrite every line end.
    const separator = allCrlf(value) ? "\r\n" : "\n";
    if (lf === v.state.doc.toString() && separator === v.state.lineBreak) return;
    const anchor = Math.min(v.state.selection.main.head, lf.length);
    v.setState(EditorState.create({ doc: value, extensions: extensions(value), selection: { anchor } }));
    v.dispatch(setDiagnostics(v.state, diagnostics(v.state, latest.current.marks)));
  }, [value]);

  const marksKey = JSON.stringify(marks.map((m) => [m.line, m.message]));
  useEffect(() => {
    const v = view.current;
    if (v === null) return;
    v.dispatch(setDiagnostics(v.state, diagnostics(v.state, latest.current.marks)));
  }, [marksKey]);

  useEffect(() => {
    view.current?.dispatch({ effects: labelled.current.reconfigure(EditorView.contentAttributes.of({ "aria-label": label })) });
  }, [label]);

  useImperativeHandle(
    ref,
    () => ({
      selectLine: (n) => {
        const v = view.current;
        if (v === null) return;
        const line = v.state.doc.line(Math.min(Math.max(n, 1), v.state.doc.lines));
        v.dispatch({ selection: { anchor: line.from, head: line.to }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
        v.focus();
      },
    }),
    [],
  );

  return <div ref={host} className={cn("flex flex-col", className)} />;
}
