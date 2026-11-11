/** The check and the save of an open file's draft, shared by the pages that edit a file. */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type FileRef, fileKey, saveFile, validateFile } from "@/lib/api";
import type { FileValidateResponse } from "../../types";
import { type Draft, isDirty } from "./draft";
import { useDrafts } from "./drafts";

/** The check in flight: the hooks that check the same file and text at once share its request. */
let lastCheck: { key: string; text: string; result: Promise<FileValidateResponse> } | null = null;

/** The check of `text` as `file`'s, through the validate route; while a check of the same file and text runs, its request is reused. */
function check(file: FileRef, text: string): Promise<FileValidateResponse> {
  const key = fileKey(file);
  if (lastCheck !== null && lastCheck.key === key && lastCheck.text === text) return lastCheck.result;
  const result = validateFile(file, text);
  const entry = { key, text, result };
  lastCheck = entry;
  // A later check reads the files again: the result is shared only while it runs.
  const clear = () => {
    if (lastCheck === entry) lastCheck = null;
  };
  result.then(clear, clear);
  return result;
}

/** The check of the open file's text, 400 ms after its last change; `pending` until the current text is checked. */
export function useValidation(file: FileRef, text: string): { pending: boolean; result: FileValidateResponse | null } {
  const [state, setState] = useState<{ text: string | null; result: FileValidateResponse | null }>({ text: null, result: null });
  // `key` stands for `file`, a new object on every render.
  const key = fileKey(file);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      check(file, text).then(
        (result) => live && setState({ text, result }),
        (e: unknown) => live && setState({ text, result: { ok: false, errors: [e instanceof Error ? e.message : String(e)], warnings: [] } }),
      );
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, text]);
  return { pending: state.text !== text, result: state.result };
}

/** The error and warning lines a save refused, for the text it sent. */
export type Refused = { text: string; errors: string[]; warnings: string[] };

/**
 * The save of a file's draft: `save` writes the draft's text against its base; on 200 it refreshes the files and the
 * file, drops the draft and calls `onSaved`; on 409 it sets `conflict`; another refusal, or a thrown error, keeps the
 * refused lines for that text. `reload` drops the draft and reads the file again. `canSave` holds while the draft has
 * unsaved changes, its text's check has finished and passes, no line refuses it, and no save is running.
 */
export function useFileSave(
  file: FileRef,
  draft: Draft,
  onSaved?: () => void,
): { save: () => Promise<void>; saving: boolean; conflict: boolean; refused: Refused | null; reload: () => void; canSave: boolean } {
  const { drop } = useDrafts();
  const queryClient = useQueryClient();
  const validation = useValidation(file, draft.text);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [refused, setRefused] = useState<Refused | null>(null);
  const save = async () => {
    setSaving(true);
    try {
      const r = await saveFile(file, draft.text, draft.base);
      if (r.status === 200) {
        await queryClient.invalidateQueries({ queryKey: ["files"] });
        await queryClient.invalidateQueries({ queryKey: ["file"] });
        setConflict(false);
        drop(file);
        onSaved?.();
      } else if (r.status === 409) setConflict(true);
      else setRefused({ text: draft.text, errors: r.body.errors, warnings: r.body.warnings });
    } catch (e) {
      setRefused({ text: draft.text, errors: [e instanceof Error ? e.message : String(e)], warnings: [] });
    } finally {
      setSaving(false);
    }
  };
  const reload = () => {
    setConflict(false);
    drop(file);
    void queryClient.invalidateQueries({ queryKey: ["file", file.scope, file.key, file.kind, file.name] });
    void queryClient.invalidateQueries({ queryKey: ["files"] });
  };
  const errors = refused !== null && refused.text === draft.text ? refused.errors : (validation.result?.errors ?? []);
  const canSave = isDirty(draft) && !validation.pending && validation.result?.ok === true && errors.length === 0 && !saving;
  return { save, saving, conflict, refused, reload, canSave };
}
