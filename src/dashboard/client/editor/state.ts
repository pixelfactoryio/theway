/**
 * The editor's state: the open file set (the workflow and the step files it names), each as loaded and as edited, and
 * the undo and redo stacks of text snapshots. Pure: no DOM, no React.
 */
import type { Document } from "yaml";
import type { SourceFile, SourceKind } from "../../types";
import { parse, textOf } from "./ops";
import { fileKey } from "./source";

/** The undo stack's depth. */
export const UNDO_DEPTH = 100;

/**
 * One open file: `loaded` its text as loaded (empty for a new file), `text` as edited, `base` the sha256 of the project
 * copy it was loaded with. A workflow is always editable (a save writes its project copy); a step file is editable when
 * it is a project file, a new one, or a global one the user chose to edit for this project.
 */
export type EditFile = {
  key: string;
  kind: SourceKind;
  name: string;
  origin: "project" | "global" | "new";
  loaded: string;
  text: string;
  base: string | null;
  globalPath: string | null;
  editable: boolean;
};

/** Every file's text at one point, by key. */
type Snapshot = Record<string, string>;

export type EditorState = { files: Record<string, EditFile>; undo: Snapshot[]; redo: Snapshot[] };

export type EditorAction =
  | { type: "load"; file: EditFile }
  | { type: "edit"; key: string; text: string }
  | { type: "editable"; key: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" };

export const initialState: EditorState = { files: {}, undo: [], redo: [] };

/** An open file from its source. */
export function fromSource(src: SourceFile): EditFile {
  return {
    key: fileKey(src.kind, src.name),
    kind: src.kind,
    name: src.name,
    origin: src.origin,
    loaded: src.text,
    text: src.text,
    base: src.sha256,
    globalPath: src.globalPath,
    editable: src.kind === "workflows" || src.origin === "project",
  };
}

/** A new file, with its template text: dirty until saved. */
export function newFile(kind: SourceKind, name: string, text: string): EditFile {
  return { key: fileKey(kind, name), kind, name, origin: "new", loaded: "", text, base: null, globalPath: null, editable: true };
}

const snapshot = (files: Record<string, EditFile>): Snapshot => Object.fromEntries(Object.values(files).map((f) => [f.key, f.text]));

/** The files with the texts of `snap`; a file the snapshot does not hold keeps its text. */
function restore(files: Record<string, EditFile>, snap: Snapshot): Record<string, EditFile> {
  const out: Record<string, EditFile> = {};
  for (const [key, f] of Object.entries(files)) out[key] = snap[key] === undefined ? f : { ...f, text: snap[key] };
  return out;
}

export function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "load":
      if (state.files[action.file.key] !== undefined) return state;
      return { ...state, files: { ...state.files, [action.file.key]: action.file } };
    case "edit": {
      const f = state.files[action.key];
      if (f === undefined || f.text === action.text) return state;
      const undo = [...state.undo, snapshot(state.files)].slice(-UNDO_DEPTH);
      return { files: { ...state.files, [action.key]: { ...f, text: action.text } }, undo, redo: [] };
    }
    case "editable": {
      const f = state.files[action.key];
      if (f === undefined || f.editable) return state;
      return { ...state, files: { ...state.files, [action.key]: { ...f, editable: true } } };
    }
    case "undo": {
      const prev = state.undo[state.undo.length - 1];
      if (prev === undefined) return state;
      return { files: restore(state.files, prev), undo: state.undo.slice(0, -1), redo: [...state.redo, snapshot(state.files)] };
    }
    case "redo": {
      const next = state.redo[state.redo.length - 1];
      if (next === undefined) return state;
      return { files: restore(state.files, next), undo: [...state.undo, snapshot(state.files)], redo: state.redo.slice(0, -1) };
    }
    case "reset":
      return initialState;
  }
}

/** Whether a file has changes to save: its text differs from the text it was loaded with. */
export const isDirty = (f: EditFile): boolean => f.text !== f.loaded;

/** The text of `f` after `op` runs on a fresh document of it. */
export function applyOp(f: EditFile, op: (doc: Document) => void): string {
  const doc = parse(f.text);
  op(doc);
  return textOf(doc);
}
