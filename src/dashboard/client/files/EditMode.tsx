/**
 * Edit mode of the Workflows page: the open file's draft in its editor, or its diff, the settings column with each
 * check line under the field it names, and the save bar with the check, what the save affects, Discard changes, Diff
 * and Save.
 */
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Document } from "yaml";
import { useLocation } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { type FileRef, fileHref, saveFile, useFiles, validateFile } from "@/lib/api";
import type { FileDetail, FilesResponse, FileValidateResponse } from "../../types";
import { insertStep, movedIndex, moveStep, parse, textOf } from "../editor/ops";
import { addHeader, editHeader, setEditableBody } from "../editor/prompt";
import { usePromptContext } from "./context";
import { Diff } from "./Diff";
import { type Draft, isDirty } from "./draft";
import { useDrafts, useUndoKeys } from "./drafts";
import { Confirm } from "./fields";
import { PromptEdit } from "./PromptEdit";
import { fieldId, problemOf, stepWords } from "./problems";
import { useSaved } from "./saved";
import { PromptSettings, WorkflowSettings } from "./Settings";
import { headerSource, workflowSource } from "./source";
import { TitleRow } from "./TitleRow";
import { Broken } from "./WorkflowView";
import { cardId, WorkflowEdit } from "./WorkflowEdit";

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

/** What a save of the file affects: a prompt's workflows, each named once; a project workflow's project; a global workflow's projects. */
export function affects(file: FileRef, detail: FileDetail | undefined, files: FilesResponse): string {
  if (file.kind === "prompts") {
    const names = [...new Set((detail?.usedBy ?? []).map((u) => (u.scope === "project" ? `${u.name} (${u.label ?? u.key})` : u.name)))];
    return names.length === 0 ? "affects no workflow" : `affects ${names.join(", ")}`;
  }
  if (file.scope === "project") return `affects ${files.projects.find((p) => p.key === file.key)?.label ?? file.key} only`;
  const except =
    detail?.overriddenBy.map((p) => p.label) ??
    files.workflows.filter((w) => w.scope === "project" && w.name === file.name).map((w) => w.label ?? w.key ?? "");
  return except.length === 0 ? "affects all projects" : `affects all projects except ${except.join(", ")}`;
}

/** Whether the columns stack: the window is narrower than the `lg` breakpoint. */
const stacked = (): boolean => !matchMedia("(min-width: 64rem)").matches;

/** Scrolls the element of `id` into view, smoothly unless the user asks for reduced motion. */
function scrollToId(id: string): void {
  const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
}

/**
 * The save bar: at the end of the centre column from the `lg` breakpoint, sticky at the bottom of the window; below
 * it, a full-width bar fixed at the bottom, whose height the page keeps free at its end (`--savebar-h`).
 */
function SaveBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--savebar-h", stacked() ? `${el.offsetHeight}px` : "0px"));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--savebar-h");
    };
  }, []);
  return (
    <div
      ref={ref}
      className="z-40 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 lg:sticky lg:bottom-4 lg:mx-6 lg:mt-4 lg:mb-4"
    >
      <div className="flex w-full flex-col gap-2 bg-invert px-4 py-2.5 text-invert-foreground shadow-lg max-lg:pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:rounded-xl">
        {children}
      </div>
    </div>
  );
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
  const saved = useSaved();
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
  const problems = errors.map((line) => problemOf(line, file, labels));
  const fielded = problems.filter((p) => p.field !== null);
  const loose = problems.filter((p) => p.field === null);
  const marked = new Map<number, number>();
  for (const p of problems) if (p.step !== null) marked.set(p.step, (marked.get(p.step) ?? 0) + 1);

  /** Selects a card; below `lg`, the settings then scroll into view. */
  const pick = (i: number | null) => {
    select(i);
    if (i !== null && stacked()) requestAnimationFrame(() => scrollToId("facts"));
  };
  /** Selects the first problem's step, or none, and focuses its field. */
  const showFirst = () => {
    const field = fielded[0]?.field;
    if (field === undefined || field === null) return;
    setDiff(false);
    if (field.at === "step") select(field.step);
    else if (field.at === "workflow") select(null);
    // The settings render the step's panels first.
    requestAnimationFrame(() => document.getElementById(fieldId(field))?.focus());
  };

  const leave = () => navigate(draft.isNew ? "/workflows" : fileHref(file));
  const save = async () => {
    setSaving(true);
    try {
      const what = files.data === undefined ? "" : affects(file, detail, files.data);
      const r = await saveFile(file, draft.text, draft.base);
      if (r.status === 200) {
        await queryClient.invalidateQueries({ queryKey: ["files"] });
        await queryClient.invalidateQueries({ queryKey: ["file"] });
        navigate(fileHref(file));
        drop(file);
        saved(file, what);
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
      <TitleRow
        title={
          <>
            <h1 className="font-mono text-[20px] font-medium break-all">{file.name}</h1>
            <Badge variant="primary-light">editing</Badge>
          </>
        }
        actions={
          !dirty && (
            <Button
              variant="outline"
              onClick={() => {
                navigate(fileHref(file));
                drop(file);
              }}
            >
              Close
            </Button>
          )
        }
      />
      {diff ? (
        <div className="flex flex-1 flex-col gap-3 pb-6 lg:px-6">
          <Button variant="outline" className="self-start" onClick={() => setDiff(false)}>
            <ArrowLeft /> Back to editing
          </Button>
          <span className="text-[12px] text-muted-foreground">{draft.isNew ? "The new file" : "Your edits to the file as saved"}</span>
          <Diff from={draft.start} to={draft.text} className="max-h-none" />
        </div>
      ) : (
        // A click outside a card clears the selection.
        <div
          className="flex flex-1 flex-col items-center gap-3 pb-6 lg:px-6"
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
                marked={marked}
                select={pick}
                insert={(index, name) => {
                  const required = (ctx.choices.find((c) => c.name === name)?.inputs ?? []).filter((i) => i.required).map((i) => i.name);
                  apply((d) => insertStep(d, index, name, required));
                  select(index);
                }}
                move={(from, to) => {
                  apply((d) => moveStep(d, from, to));
                  if (selected !== null) select(movedIndex(selected, from, to));
                }}
              />
            )
          ) : (
            <PromptEdit text={draft.text} setBody={(body) => update(file, (text) => setEditableBody(text, body))} />
          )}
        </div>
      )}
    </>
  );

  const facts =
    workflow !== null ? (
      "error" in workflow ? null : (
        <WorkflowSettings
          source={workflow}
          selected={selected}
          select={select}
          apply={apply}
          ctx={ctx}
          problems={fielded}
          back={() => selected !== null && scrollToId(cardId(selected))}
        />
      )
    ) : (
      <PromptSettings header={header} apply={applyHeader} useAsStep={() => update(file, addHeader)} problems={fielded} />
    );

  const count = errors.length;
  const status = validation.pending ? (
    <span className="opacity-70">checking…</span>
  ) : count > 0 ? (
    <span className="text-red-300">
      {count} {count > 1 ? "problems" : "problem"}
    </span>
  ) : (
    <span className="opacity-70">{files.data === undefined ? "" : `check passes · ${affects(file, detail, files.data)}`}</span>
  );
  /** A ghost button on the bar's dark background. */
  const ghost = "hover:bg-white/10 hover:text-invert-foreground aria-pressed:bg-white/15";
  // Shown only while there is something to save.
  const bar = dirty && (
    <SaveBar>
      {conflict && (
        <div className="flex items-center gap-3">
          <span>Changed on disk since you opened it.</span>
          <Button variant="secondary" size="sm" onClick={reload}>
            Reload
          </Button>
        </div>
      )}
      {!validation.pending && loose.length > 0 && (
        <ul className="flex max-h-[120px] flex-col gap-0.5 overflow-auto">
          {loose.map((p, i) => (
            <li key={`${i}:${p.line}`} className="font-mono text-[12px] break-words text-red-300">
              {p.step !== null && p.step < (workflow !== null && !("error" in workflow) ? workflow.steps.length : 0) ? (
                <button type="button" className="cursor-pointer text-left hover:underline" onClick={() => pick(p.step)}>
                  {stepWords(p.step)}: {p.message}
                </button>
              ) : (
                p.message
              )}
            </li>
          ))}
        </ul>
      )}
      {warnings.map((w, i) => (
        <span key={`${i}:${w}`} className="text-[12px] break-words opacity-70">
          {w}
        </span>
      ))}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* The dark-scheme colours of the badge, on the bar's dark background. */}
        <Badge variant="warning-light" className="border-warning/25 bg-warning/15 text-warning">
          {draft.isNew ? "New file" : "Unsaved changes"}
        </Badge>
        <span className="min-w-0 flex-1 basis-32 truncate text-[13px]">{status}</span>
        {!validation.pending && fielded.length > 0 && (
          <Button variant="ghost" size="sm" className={ghost} onClick={showFirst}>
            Show first
          </Button>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="ghost" className={ghost} disabled={saving} onClick={() => setDiscarding(true)}>
            Discard changes
          </Button>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/25" />
          <Button variant="ghost" className={ghost} aria-pressed={diff} onClick={() => setDiff(!diff)}>
            Diff
          </Button>
          <Button disabled={!canSave} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
      <Confirm
        open={discarding}
        title={`Discard your changes to ${file.name}?`}
        action="Discard changes"
        onConfirm={() => {
          leave();
          drop(file);
        }}
        onClose={() => setDiscarding(false)}
      />
    </SaveBar>
  );

  return layout({ centre, facts, bar });
}
