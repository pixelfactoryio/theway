/**
 * A workflow's page, always editable: the header with the Diagram / YAML switch, the status, Discard, Save and History;
 * then the workflow drawn as a diagram, whose cards open their settings in a panel, or its text in the YAML view. It
 * works on the file's draft, which its first edit starts.
 */
import { cn } from "cn";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Document } from "yaml";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { usePromptContext } from "@/files/context";
import { Diagram, NotDrawn, type Selection } from "@/files/Diagram";
import { type Draft, isDirty, startDraft } from "@/files/draft";
import { useDrafts, useUndoKeys } from "@/files/drafts";
import { useFileSave, useValidation } from "@/files/editing";
import { Confirm } from "@/files/fields";
import { NewDialog } from "@/files/NewDialog";
import { promptName, workflowSource } from "@/files/source";
import { StepPanel } from "@/files/StepPanel";
import { StepPicker } from "@/files/StepPicker";
import { WorkflowPanel } from "@/files/WorkflowPanel";
import { YamlView } from "@/files/YamlView";
import { type FileRef, fileHref, fileKey, useFile, useFiles, versionsHref } from "@/lib/api";
import { ALL_PROJECTS, plural } from "@/lib/changes";
import { groupErrors, splitErrorLine } from "@/lib/workflows";
import type { FileDetail } from "../../types";
import { insertStep, movedIndex, moveStep, parse, textOf } from "../editor/ops";

/** The view of a workflow's page. */
export type View = "diagram" | "yaml";

/** Whether the window is at least as wide as the `lg` breakpoint. */
function useWide(): boolean {
  const query = "(min-width: 64rem)";
  const [wide, setWide] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const change = () => setWide(list.matches);
    list.addEventListener("change", change);
    return () => list.removeEventListener("change", change);
  }, []);
  return wide;
}

/** A box of check lines: destructive for errors, warning for warnings. */
function Lines({ lines, tone }: { lines: readonly string[]; tone: "error" | "warning" }) {
  if (lines.length === 0) return null;
  return (
    <ul
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border px-4 py-2.5 font-mono text-[12px] break-words",
        tone === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-warning/40 bg-warning/10",
      )}
    >
      {lines.map((l, i) => (
        <li key={`${i}:${l}`}>{l}</li>
      ))}
    </ul>
  );
}

/** A check line as the boxes show it: the open file's own prefix removed. */
const withoutPrefix = (line: string, name: string): string => {
  const s = splitErrorLine(line, name);
  return s.own && s.where !== null ? `${s.where}: ${s.message}` : s.message;
};

/** The page of a workflow on `draft`: the file's draft, or, before its first edit, the saved text as one; `own` when the store holds it. */
function Editor({ file, draft, own, detail, view }: { file: FileRef; draft: Draft; own: boolean; detail: FileDetail | undefined; view: View }) {
  const { start, update, drop, undo, redo } = useDrafts();
  const files = useFiles();
  const [, navigate] = useLocation();
  const wide = useWide();
  const [discarding, setDiscarding] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  // Page state: both routes of a workflow render this page under the same key, so the Diagram / YAML switch keeps it.
  const [selection, select] = useState<Selection | null>(null);
  useUndoKeys(file);
  const validation = useValidation(file, draft.text);
  const { save, saving, conflict, refused, reload, canSave } = useFileSave(file, draft);
  const text = draft.text;
  const source = useMemo(() => workflowSource(text), [text]);
  const drawn = "error" in source ? null : source;
  const named = drawn === null ? [] : drawn.steps.flatMap((s) => [s.name, s.onFail?.name ?? null, ...(s.matrix?.values ?? []).map(promptName)]);
  const ctx = usePromptContext(file, named);
  const dirty = isDirty(draft);

  // The selection is cleared when its step is gone, or when the draft cannot be drawn.
  const valid = selection === null || (drawn !== null && (selection === "workflow" || selection.step < drawn.steps.length));
  if (!valid) select(null);
  const selected = valid ? selection : null;

  /** One edit of the draft: `fn` of its text, `at` the time of a typed edit; the first edit starts the draft from the saved text. */
  const change = (fn: (text: string) => string, at?: number) => {
    if (!own) start(file, draft.text, draft.base, false);
    update(file, fn, at);
  };
  /** Applies `op` to the workflow's Document, as one edit of the draft. */
  const apply = (op: (d: Document) => void) =>
    change((t) => {
      const d = parse(t);
      op(d);
      return textOf(d);
    });

  // The lines to show: a refused save's for this text, else the last check's.
  const mine = refused !== null && refused.text === text;
  const errors = mine ? refused.errors : (validation.result?.errors ?? []);
  const warnings = (mine ? refused.warnings : (validation.result?.warnings ?? [])).map((l) => withoutPrefix(l, file.name));
  const groups = groupErrors(errors, file.name, drawn?.steps.length ?? 0);
  const loose = drawn === null ? errors.map((l) => withoutPrefix(l, file.name)) : groups.loose;

  const discard = () => {
    drop(file);
    if (draft.isNew) navigate("/workflows");
  };
  const status = draft.isNew ? "New file" : dirty ? "Unsaved changes" : "Saved";
  const description = drawn !== null ? drawn.description : (detail?.description ?? "");
  const yamlHref = `${fileHref(file)}/yaml`;
  const close = () => select(null);

  const panel =
    drawn === null || selected === null ? null : selected === "workflow" ? (
      <WorkflowPanel file={file} source={drawn} apply={apply} errors={groups.workflow} files={files.data} detail={detail} close={close} />
    ) : (
      <StepPanel source={drawn} index={selected.step} ctx={ctx} apply={apply} errors={groups.steps.get(selected.step) ?? []} close={close} />
    );

  const insert = (index: number, name: string) => {
    const required = (ctx.choices.find((c) => c.name === name)?.inputs ?? []).filter((i) => i.required).map((i) => i.name);
    apply((d) => insertStep(d, index, name, required));
    setPicking(null);
    select({ step: index });
  };

  /** A link of the Diagram / YAML switch. */
  const tab = (to: View, label: string, href: string) => (
    <Link
      href={href}
      aria-current={view === to ? "page" : undefined}
      className={cn("rounded-md px-3 py-1 font-medium", view === to ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );

  return (
    <main id="content" tabIndex={-1} className="flex min-h-dvh flex-1 flex-col outline-none">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-divider px-4 py-3 lg:flex-nowrap lg:px-6">
        <Button variant="ghost" size="icon" aria-label="Back to the workflows" className="max-lg:order-1" onClick={() => navigate("/workflows")}>
          <X />
        </Button>
        <h1 className="min-w-0 text-[18px] font-semibold break-all max-lg:order-1 max-lg:mr-auto">{file.name}</h1>
        <span className="hidden min-w-0 flex-1 truncate text-muted-foreground lg:block">{description}</span>
        <span aria-hidden="true" className="h-0 basis-full max-lg:order-2 lg:hidden" />
        <nav aria-label="View" className="flex rounded-lg bg-muted p-0.5 max-lg:order-3">
          {tab("diagram", "Diagram", fileHref(file))}
          {tab("yaml", "YAML", yamlHref)}
        </nav>
        <span role="status" className="text-[13px] text-muted-foreground max-lg:order-3">
          {status}
        </span>
        {errors.length > 0 && (
          <Badge variant="destructive" className="max-lg:order-3">
            {plural(errors.length, "error", "errors")}
          </Badge>
        )}
        {dirty && (
          <Button variant="outline" disabled={saving} className="max-lg:order-3" onClick={() => setDiscarding(true)}>
            Discard
          </Button>
        )}
        <Button disabled={!canSave} className="max-lg:order-1" onClick={() => void save()}>
          Save
        </Button>
        {!draft.isNew && (
          <Button variant="outline" className="max-lg:order-1" onClick={() => navigate(versionsHref(file))}>
            History
          </Button>
        )}
      </div>
      <Confirm open={discarding} title={`Discard your unsaved changes to ${file.name}?`} action="Discard" onConfirm={discard} onClose={() => setDiscarding(false)} />
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 lg:p-6">
          {conflict && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5">
              <span className="mr-auto">Changed on disk since you opened it.</span>
              <Button size="sm" variant="outline" onClick={reload}>
                Reload
              </Button>
            </div>
          )}
          {view === "yaml" ? (
            <YamlView
              name={file.name}
              text={text}
              errors={errors}
              warnings={<Lines lines={warnings} tone="warning" />}
              onText={(t) => change(() => t, Date.now())}
              onUndo={() => undo(file)}
              onRedo={() => redo(file)}
            />
          ) : (
            <>
              <Lines lines={loose} tone="error" />
              <Lines lines={warnings} tone="warning" />
              <div className="wf-canvas flex-1 overflow-x-auto rounded-xl p-4 lg:p-6">
                {drawn === null ? (
                  <NotDrawn error={"error" in source ? source.error : ""} yamlHref={yamlHref} />
                ) : (
                  <Diagram
                    source={drawn}
                    ctx={ctx}
                    selection={selected}
                    select={select}
                    workflowError={groups.workflow.length > 0}
                    stepError={(i) => groups.steps.has(i)}
                    add={setPicking}
                    move={(from, to) => {
                      apply((d) => moveStep(d, from, to));
                      if (selected !== null && selected !== "workflow") select({ step: movedIndex(selected.step, from, to) });
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
        {view === "diagram" && panel !== null && wide && (
          <aside aria-label={selected === "workflow" ? "Workflow settings" : "Step"} className="w-[360px] shrink-0 overflow-auto border-l border-divider p-5">
            {panel}
          </aside>
        )}
      </div>
      <Dialog open={view === "diagram" && panel !== null && !wide} onOpenChange={(o) => !o && close()}>
        <DialogContent showCloseButton={false} className="block max-h-[calc(100dvh-2rem)] overflow-auto sm:max-w-[420px]">
          <DialogTitle className="sr-only">{selected === "workflow" ? "Workflow settings" : "Step"}</DialogTitle>
          {!wide && panel}
        </DialogContent>
      </Dialog>
      <StepPicker
        open={picking !== null}
        ctx={ctx}
        onPick={(name) => picking !== null && insert(picking, name)}
        onWrite={() => {
          setPicking(null);
          setWriting(true);
        }}
        onClose={() => setPicking(null)}
      />
      <NewDialog kind={writing ? "prompts" : null} project={file.key ?? ALL_PROJECTS} onClose={() => setWriting(false)} />
    </main>
  );
}

/** A workflow's page in `view`: its draft when it has one, else its saved text; a new file has nothing on disk to read. */
export function WorkflowPage({ file, view }: { file: FileRef; view: View }) {
  const { drafts } = useDrafts();
  const draft = drafts.get(fileKey(file))?.draft;
  const detail = useFile(file, draft === undefined || !draft.isNew);
  const saved = detail.data;
  if (draft === undefined && saved === undefined) {
    return (
      <main id="content" tabIndex={-1} className="flex w-full flex-col outline-none">
        <Empty error={detail.isError}>{detail.isError ? detail.error.message : "Loading…"}</Empty>
      </main>
    );
  }
  const shown = draft ?? startDraft((saved as FileDetail).text, (saved as FileDetail).sha256, false);
  return <Editor file={file} draft={shown} own={draft !== undefined} detail={saved} view={view} />;
}
