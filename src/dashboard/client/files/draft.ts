/**
 * The draft of a workflow or step file: the text it started from, its `base`, its current text and its undo and redo
 * stacks. Pure: no DOM, no React; every function returns a new `Draft`.
 */

/** A file's draft; `base` is the sha256 loaded, `null` for a new file. */
export type Draft = { start: string; base: string | null; text: string; undo: string[]; redo: string[]; isNew: boolean };

/** The most texts the undo stack keeps. */
const MAX_UNDO = 100;

/** A draft of `text`, unchanged. */
export const startDraft = (text: string, base: string | null, isNew: boolean): Draft => ({ start: text, base, text, undo: [], redo: [], isNew });

/** The draft with `text` as its text: the current one goes on `undo` (the newest 100 kept) and `redo` is cleared; the same text changes nothing. */
export function edit(draft: Draft, text: string): Draft {
  if (text === draft.text) return draft;
  return { ...draft, text, undo: [...draft.undo, draft.text].slice(-MAX_UNDO), redo: [] };
}

/** The draft back to its last text before the current one, the current one on `redo`; unchanged with nothing to undo. */
export function undo(draft: Draft): Draft {
  const previous = draft.undo[draft.undo.length - 1];
  if (previous === undefined) return draft;
  return { ...draft, text: previous, undo: draft.undo.slice(0, -1), redo: [...draft.redo, draft.text] };
}

/** The draft forward to the text last undone, the current one on `undo`; unchanged with nothing to redo. */
export function redo(draft: Draft): Draft {
  const next = draft.redo[draft.redo.length - 1];
  if (next === undefined) return draft;
  return { ...draft, text: next, undo: [...draft.undo, draft.text].slice(-MAX_UNDO), redo: draft.redo.slice(0, -1) };
}

/** Whether the draft has changes: its text differs from the text it started from; a new file's draft always has. */
export const isDirty = (draft: Draft): boolean => draft.isNew || draft.text !== draft.start;
