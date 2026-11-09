/**
 * The drafts store: at the app root, the draft of every file being edited, by file key. Drafts live in memory: they
 * survive moving between pages and are lost on reload, which a `beforeunload` prompt warns about while one is dirty.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type FileRef, fileKey } from "@/lib/api";
import { type Draft, edit as editDraft, isDirty, redo as redoDraft, startDraft, undo as undoDraft } from "./draft";

/** A file's draft with the file it is for. */
export type DraftEntry = { file: FileRef; draft: Draft };

type Store = {
  /** Every draft, by file key. */
  drafts: ReadonlyMap<string, DraftEntry>;
  /** Starts a draft of `file` from `text`. */
  start: (file: FileRef, text: string, base: string | null, isNew: boolean) => void;
  /** Sets the text of a file's draft. */
  edit: (file: FileRef, text: string) => void;
  /** Sets the text of a file's draft to `fn` of its current text. */
  update: (file: FileRef, fn: (text: string) => string) => void;
  undo: (file: FileRef) => void;
  redo: (file: FileRef) => void;
  /** Drops a file's draft. */
  drop: (file: FileRef) => void;
};

const DraftsContext = createContext<Store | null>(null);

export function DraftsProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, DraftEntry>>(new Map());
  const change = useCallback((file: FileRef, fn: (d: Draft) => Draft) => {
    setDrafts((prev) => {
      const key = fileKey(file);
      const found = prev.get(key);
      if (found === undefined) return prev;
      const next = fn(found.draft);
      if (next === found.draft) return prev;
      return new Map(prev).set(key, { file: found.file, draft: next });
    });
  }, []);
  const store = useMemo<Store>(
    () => ({
      drafts,
      start: (file, text, base, isNew) => setDrafts((prev) => new Map(prev).set(fileKey(file), { file, draft: startDraft(text, base, isNew) })),
      edit: (file, text) => change(file, (d) => editDraft(d, text)),
      update: (file, fn) => change(file, (d) => editDraft(d, fn(d.text))),
      undo: (file) => change(file, undoDraft),
      redo: (file) => change(file, redoDraft),
      drop: (file) =>
        setDrafts((prev) => {
          if (!prev.has(fileKey(file))) return prev;
          const next = new Map(prev);
          next.delete(fileKey(file));
          return next;
        }),
    }),
    [drafts, change],
  );
  const dirty = [...drafts.values()].some((e) => isDirty(e.draft));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);
  return <DraftsContext.Provider value={store}>{children}</DraftsContext.Provider>;
}

/** The drafts store. */
export function useDrafts(): Store {
  const store = useContext(DraftsContext);
  if (store === null) throw new Error("useDrafts outside DraftsProvider");
  return store;
}

/** A file's draft, `undefined` when it has none. */
export const useDraft = (file: FileRef): Draft | undefined => useDrafts().drafts.get(fileKey(file))?.draft;

/** Ctrl or Cmd and Z undoes the open file's last edit, with Shift redoes; neither acts while an input or textarea has the focus. */
export function useUndoKeys(file: FileRef): void {
  const { undo, redo } = useDrafts();
  const key = fileKey(file);
  // `key` stands for `file`, a new object on every render.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) redo(file);
      else undo(file);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [key, undo, redo]);
}
