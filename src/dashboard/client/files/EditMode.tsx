/**
 * Edit mode of the Workflows page: the open file's draft in its editor, the settings column, and the save bar with
 * the check, what the save reaches, the diff, Discard and Save.
 */
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { Document } from "yaml";
import { useLocation } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { type FileRef, fileHref, saveFile, useFiles, validateFile } from "@/lib/api";
import type { FileDetail, FilesResponse, FileValidateResponse } from "../../types";
import { insertStep, moveStep, parse, textOf } from "../editor/ops";
import { addHeader, editHeader, setBody } from "../editor/prompt";
import { usePromptContext } from "./context";
import { Diff } from "./Diff";
import { type Draft, isDirty } from "./draft";
import { useDrafts, useUndoKeys } from "./drafts";
import { Confirm } from "./fields";
import { PromptEdit } from "./PromptEdit";
import { PromptSettings, WorkflowSettings } from "./Settings";
import { headerSource, workflowSource } from "./source";
import { Broken, shownLine } from "./WorkflowView";
import { WorkflowEdit } from "./WorkflowEdit";

/** The check of the open file's text, 400 ms after its last change; `pending` until the current text is checked. */
function useValidation(file: FileRef, text: string): { pending: boolean; result: FileValidateResponse | null } {
  const [state, setState] = useState<{ text: string | null; result: FileValidateResponse | null }>({ text: null, result: null });
  // `key` stands for `file`, a new object on every render.
  const key = fileHref(file);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      validateFile(file, text).then(
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

/** What a save of the file reaches: a prompt's workflows, each named once; a project workflow's project; a global workflow's projects. */
export function reach(file: FileRef, detail: FileDetail | undefined, files: FilesResponse): string {
  if (file.kind === "prompts") {
    const names = [...new Set((detail?.usedBy ?? []).map((u) => (u.scope === "project" ? `${u.name} (${u.label ?? u.key})` : u.name)))];
    return names.length === 0 ? "reaches no workflow" : `reaches ${names.join(", ")}`;
  }
  if (file.scope === "project") return `reaches ${files.projects.find((p) => p.key === file.key)?.label ?? file.key} only`;
  const except =
    detail?.overriddenBy.map((p) => p.label) ??
    files.workflows.filter((w) => w.scope === "project" && w.name === file.name).map((w) => w.label ?? w.key ?? "");
  return except.length === 0 ? "reaches all projects" : `reaches all projects except ${except.join(", ")}`;
}

/** The step a check line names in the workflow `name`: its `steps[<i>]` index, `null` for none. */
export function stepOfLine(line: string, name: string): number | null {
  const m = new RegExp(`(?:^|: )workflows/${name}\\.yaml: steps\\[(\\d+)\\]`).exec(line);
  return m === null ? null : Number(m[1]);
}

/** The three parts edit mode fills: the centre, the right column and the save bar. */
export type EditParts = { centre: ReactNode; facts: ReactNode; bar: ReactNode };

export function EditMode({
  file,
  draft,
  detail,
  layout,
}: {
  file: FileRef;
  draft: Draft;
  detail: FileDetail | undefined;
  layout: (parts: EditParts) => ReactNode;
}) {
  const { update, drop } = useDrafts();
  const files = useFiles();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  useUndoKeys(file);
  const [selected, select] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [refused, setRefused] = useState<{ text: string; errors: string[]; warnings: string[] } | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [diff, setDiff] = useState(false);
  const validation = useValidation(file, draft.text);

  const workflow = useMemo(() => (file.kind === "workflows" ? workflowSource(draft.text) : null), [file.kind, draft.text]);
  const header = useMemo(() => (file.kind === "prompts" ? headerSource(draft.text) : null), [file.kind, draft.text]);
  const named = workflow !== null && !("error" in workflow) ? workflow.steps.flatMap((s) => [s.name, s.onFail?.name ?? null]) : [];
  const ctx = usePromptContext(file, named);
  const dirty = isDirty(draft);
  const labels = files.data?.projects.map((p) => p.label) ?? [];

  /** Applies `op` to the workflow's Document, as one edit of the draft. */
  const apply = (op: (d: Document) => void) =>
    update(file, (text) => {
      const d = parse(text);
      op(d);
      return textOf(d);
    });
  /** Applies `op` to the prompt header's Document, as one edit of the draft. */
  const applyHeader = (op: (d: Document) => void) => update(file, (text) => editHeader(text, op));

  // The lines to show: a refused save's for this text, else the last check's.
  const errors = refused !== null && refused.text === draft.text ? refused.errors : (validation.result?.errors ?? []);
  const warnings = refused !== null && refused.text === draft.text ? refused.warnings : (validation.result?.warnings ?? []);
  const ties = errors.map((line) => ({ line, step: file.kind === "workflows" ? stepOfLine(line, file.name) : null }));
  const tied = new Set(ties.flatMap(({ step }) => (step === null ? [] : [step])));
  const tiedLines = ties.filter(({ step }) => step !== null && step === selected).map(({ line }) => shownLine(line, labels));

  const leave = () => navigate(draft.isNew ? "/workflows" : fileHref(file));
  const save = async () => {
    setSaving(true);
    try {
      const r = await saveFile(file, draft.text, draft.base);
      if (r.status === 200) {
        await queryClient.invalidateQueries({ queryKey: ["files"] });
        await queryClient.invalidateQueries({ queryKey: ["file"] });
        navigate(fileHref(file));
        drop(file);
      } else if (r.status === 409) setConflict(true);
      else setRefused({ text: draft.text, errors: r.body.errors, warnings: r.body.warnings });
    } catch (e) {
      setRefused({ text: draft.text, errors: [e instanceof Error ? e.message : String(e)], warnings: [] });
    } finally {
      setSaving(false);
    }
  };
  const reload = () => {
    drop(file);
    void queryClient.invalidateQueries({ queryKey: ["file", file.scope, file.key, file.kind, file.name] });
    void queryClient.invalidateQueries({ queryKey: ["files"] });
  };
  const canSave = dirty && !validation.pending && validation.result?.ok === true && errors.length === 0 && !saving;

  const centre = (
    <>
      <div className="flex flex-wrap items-center gap-3 py-4 pl-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="font-mono text-[20px] font-medium break-all">{file.name}</h1>
          <Badge variant="primary-light">editing</Badge>
        </div>
        <div className="ml-auto flex gap-2">
          {!dirty && (
            <Button
              variant="outline"
              onClick={() => {
                navigate(fileHref(file));
                drop(file);
              }}
            >
              Close
            </Button>
          )}
        </div>
      </div>
      {/* A click outside a card clears the selection. */}
      <div
        className="flex flex-1 flex-col items-center gap-3 px-6 pb-28"
        onClick={(e) => {
          // A click in a portalled menu reaches this handler through the React tree, not the DOM.
          if (e.currentTarget.contains(e.target as Node)) select(null);
        }}
      >
        {workflow !== null ? (
          "error" in workflow ? (
            <Broken lines={[workflow.error]} text={draft.text} />
          ) : (
            <WorkflowEdit
              steps={workflow.steps}
              runsOn={workflow.runsOn}
              ctx={ctx}
              selected={selected}
              tied={tied}
              select={select}
              insert={(index, name) => {
                const required = (ctx.choices.find((c) => c.name === name)?.inputs ?? []).filter((i) => i.required).map((i) => i.name);
                apply((d) => insertStep(d, index, name, required));
                select(index);
              }}
              move={(from, to) => {
                apply((d) => moveStep(d, from, to));
                if (selected === from) select(to);
              }}
            />
          )
        ) : (
          <PromptEdit text={draft.text} setBody={(body) => update(file, (text) => setBody(text, body))} />
        )}
      </div>
    </>
  );

  const facts =
    workflow !== null ? (
      "error" in workflow ? null : (
        <WorkflowSettings source={workflow} selected={selected} select={select} apply={apply} ctx={ctx} tiedLines={tiedLines} />
      )
    ) : (
      <PromptSettings header={header} apply={applyHeader} useAsStep={() => update(file, addHeader)} />
    );

  const changes = draft.undo.length;
  const status = validation.pending ? (
    <span className="opacity-70">checking…</span>
  ) : errors.length > 0 ? (
    <span className="text-red-300">
      {errors.length} {errors.length > 1 ? "errors" : "error"}
    </span>
  ) : (
    <span className="opacity-70">{files.data === undefined ? "" : `check passes · ${reach(file, detail, files.data)}`}</span>
  );
  const bar = (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-6">
      <div className="pointer-events-auto flex w-full max-w-[880px] flex-col gap-2 rounded-xl bg-invert px-4 py-2.5 text-invert-foreground shadow-lg">
        {conflict && (
          <div className="flex items-center gap-3">
            <span>Changed on disk since you opened it.</span>
            <Button variant="secondary" size="sm" onClick={reload}>
              Reload
            </Button>
          </div>
        )}
        {errors.length > 0 && (
          <div className="flex max-h-[160px] flex-col gap-0.5 overflow-auto">
            {ties.map(({ line, step }, i) => (
              <button
                key={`${i}:${line}`}
                type="button"
                className={cn("text-left font-mono text-[12px] break-words text-red-300", step !== null && "cursor-pointer hover:underline")}
                disabled={step === null}
                onClick={() => step !== null && select(step)}
              >
                {shownLine(line, labels)}
              </button>
            ))}
          </div>
        )}
        {warnings.map((w, i) => (
          <span key={`${i}:${w}`} className="text-[12px] break-words opacity-70">
            {w}
          </span>
        ))}
        {diff && dirty && (
          <div className="text-foreground">
            <Diff from={draft.start} to={draft.text} />
          </div>
        )}
        <div className="flex items-center gap-3">
          {dirty && (
            // The dark-scheme colours of the badge, on the bar's dark background.
            <Badge variant="warning-light" className="border-warning/25 bg-warning/15 text-warning">
              {changes} {changes > 1 ? "changes" : "change"}
            </Badge>
          )}
          <span className="min-w-0 truncate text-[13px]">{dirty ? status : <span className="opacity-70">no changes</span>}</span>
          <div className="ml-auto flex shrink-0 gap-2">
            <Button
              variant="ghost"
              className="hover:bg-white/10 hover:text-invert-foreground aria-pressed:bg-white/15"
              aria-pressed={diff}
              disabled={!dirty}
              onClick={() => setDiff(!diff)}
            >
              Diff
            </Button>
            <Button
              variant="ghost"
              className="hover:bg-white/10 hover:text-invert-foreground"
              disabled={!dirty || saving}
              onClick={() => setDiscarding(true)}
            >
              Discard
            </Button>
            <Button disabled={!canSave} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      </div>
      <Confirm
        open={discarding}
        title={`Discard your changes to ${file.name}?`}
        action="Discard"
        onConfirm={() => {
          leave();
          drop(file);
        }}
        onClose={() => setDiscarding(false)}
      />
    </div>
  );

  return layout({ centre, facts, bar });
}
