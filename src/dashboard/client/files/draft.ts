/**
 * The draft of a workflow or step file: the text it started from, its `base`, its current text and its undo and redo
 * stacks. Pure: no DOM, no React; every function returns a new `Draft`.
 */

/**
 * A file's draft; `base` is the sha256 loaded, `null` for a new file. `typedAt` is the time, in milliseconds, of its
 * last typed edit (one made in a code editor), `null` when its last change was not a typed edit: typed edits less than
 * 1 second apart are one undo step.
 */
export type Draft = { start: string; base: string | null; text: string; undo: string[]; redo: string[]; isNew: boolean; typedAt: number | null };

/** The most texts the undo stack keeps. */
const MAX_UNDO = 100;

/** The most time, in milliseconds, between two typed edits of one undo step. */
const TYPING_GROUP = 1000;

/** A draft of `text`, unchanged. */
export const startDraft = (text: string, base: string | null, isNew: boolean): Draft => ({
  start: text,
  base,
  text,
  undo: [],
  redo: [],
  isNew,
  typedAt: null,
});

/**
 * The draft with `text` as its text; `at` is the time of a typed edit, absent for any other edit. The same text changes
 * nothing. A typed edit less than 1 second after the previous typed edit (`typedAt`) joins its undo step: `undo` is
 * left as it is and `redo` is cleared. Otherwise the current text goes on `undo` (the newest 100 kept) and `redo` is
 * cleared. `typedAt` becomes `at`, or `null` without it.
 */
export function edit(draft: Draft, text: string, at?: number): Draft {
  if (text === draft.text) return draft;
  if (at !== undefined && draft.typedAt !== null && at - draft.typedAt >= 0 && at - draft.typedAt < TYPING_GROUP) {
    return { ...draft, text, redo: [], typedAt: at };
  }
  return { ...draft, text, undo: [...draft.undo, draft.text].slice(-MAX_UNDO), redo: [], typedAt: at ?? null };
}

/** The draft back to its last text before the current one, the current one on `redo`; unchanged with nothing to undo. Ends a typing group. */
export function undo(draft: Draft): Draft {
  const previous = draft.undo[draft.undo.length - 1];
  if (previous === undefined) return draft;
  return { ...draft, text: previous, undo: draft.undo.slice(0, -1), redo: [...draft.redo, draft.text], typedAt: null };
}

/** The draft forward to the text last undone, the current one on `undo`; unchanged with nothing to redo. Ends a typing group. */
export function redo(draft: Draft): Draft {
  const next = draft.redo[draft.redo.length - 1];
  if (next === undefined) return draft;
  return { ...draft, text: next, undo: [...draft.undo, draft.text].slice(-MAX_UNDO), redo: draft.redo.slice(0, -1), typedAt: null };
}

/** Whether the draft has changes: its text differs from the text it started from; a new file's draft always has. */
export const isDirty = (draft: Draft): boolean => draft.isNew || draft.text !== draft.start;
