/**
 * Edit mode of the Workflows page: the open workflow's draft in its editor, or its diff, the settings column with each
 * check line under the field it names, and the save bar with the check, what the save affects, Discard changes, Diff
 * and Save.
 */
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Document } from "yaml";
import { useLocation } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { type FileRef, fileHref, useFiles } from "@/lib/api";
import type { FileDetail, FilesResponse } from "../../types";
import { insertStep, movedIndex, moveStep, parse, textOf } from "../editor/ops";
import { usePromptContext } from "./context";
import { Diff } from "./Diff";
import { type Draft, isDirty } from "./draft";
import { useDrafts, useUndoKeys } from "./drafts";
import { useFileSave, useValidation } from "./editing";
import { Confirm } from "./fields";
import { fieldId, problemOf, stepWords } from "./problems";
import { useSaved } from "./saved";
import { WorkflowSettings } from "./Settings";
import { workflowSource } from "./source";
import { TitleRow } from "./TitleRow";
import { Broken } from "./WorkflowView";
import { cardId, WorkflowEdit } from "./WorkflowEdit";

/** What a save of the workflow affects: a project workflow's project; a global workflow's projects. */
export function affects(file: FileRef, detail: FileDetail | undefined, files: FilesResponse): string {
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
  const [, navigate] = useLocation();
  const saved = useSaved();
  useUndoKeys(file);
  const [selected, select] = useState<number | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [diff, setDiff] = useState(false);
  const validation = useValidation(file, draft.text);
  const { save, saving, conflict, refused, reload, canSave } = useFileSave(file, draft, () => {
    navigate(fileHref(file));
    saved(file, files.data === undefined ? "" : affects(file, detail, files.data));
  });

  const workflow = useMemo(() => workflowSource(draft.text), [draft.text]);
  const named = !("error" in workflow) ? workflow.steps.flatMap((s) => [s.name, s.onFail?.name ?? null]) : [];
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

  // The lines to show: a refused save's for this text, else the last check's.
  const errors = refused !== null && refused.text === draft.text ? refused.errors : (validation.result?.errors ?? []);
  const warnings = refused !== null && refused.text === draft.text ? refused.warnings : (validation.result?.warnings ?? []);
  const problems = errors.map((line) => problemOf(line, { kind: "workflows", name: file.name }, labels));
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
          {"error" in workflow ? (
            <Broken lines={[workflow.error]} text={draft.text} />
          ) : (
            <WorkflowEdit
                steps={workflow.steps}
                runsOn={workflow.runsOn ?? ""}
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
          )}
        </div>
      )}
    </>
  );

  const facts =
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
              {p.step !== null && p.step < (!("error" in workflow) ? workflow.steps.length : 0) ? (
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
