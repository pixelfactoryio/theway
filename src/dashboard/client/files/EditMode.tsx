/**
 * Edit mode of the Workflows page: the open file's draft drawn with its `+` points and selection, the settings
 * column, and the save bar with its validation, error lines, diff, Discard and Save.
 */
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { structuredPatch } from "diff";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { absoluteOf, type FileRef, fileHref, relOf, saveFile, useFiles, validateFile } from "@/lib/api";
import type { FileDetail, FileItem, FilesResponse, FileValidateResponse } from "../../types";
import { insertEntry, insertNode, parse, setParam, textOf } from "../editor/ops";
import { type Construct, DEFAULT_CONSTRUCT, NEW_PARAM, newParamName } from "./constructs";
import { type Draft, isDirty } from "./draft";
import { useDrafts, useUndoKeys } from "./drafts";
import { Confirm } from "./fields";
import { chainOf, deepest, locate, shownLine } from "./locate";
import { pathKey, type Selection } from "./selection";
import { Settings } from "./Settings";
import { type StepNode, stepSource, workflowSource } from "./source";
import { StepView } from "./StepView";
import { Broken } from "./WorkflowView";
import { type NewEntryChoice, WorkflowEdit } from "./WorkflowEdit";

/** The steps a workflow may name: the global ones for a global workflow; a project's own, then the global ones it does not have. */
export function usableSteps(files: FilesResponse, file: FileRef): FileItem[] {
  const global = files.steps.filter((s) => s.scope === "global");
  if (file.scope === "global") return global;
  const own = files.steps.filter((s) => s.scope === "project" && s.key === file.key);
  return [...own, ...global.filter((g) => !own.some((o) => o.name === g.name))];
}

/** The validation of the open file's text, 400 ms after its last change; `pending` until the current text is checked. */
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

/** The constructs of a tree, depth first. */
const flatten = (list: StepNode[]): StepNode[] => list.flatMap((n) => [n, ...("children" in n ? flatten(n.children) : [])]);

/** The reach of the file, as the facts column words it. */
function reach(file: FileRef, detail: FileDetail | undefined, files: FilesResponse): string {
  if (file.kind === "workflows") {
    if (file.scope === "project") return `${files.projects.find((p) => p.key === file.key)?.label ?? file.key} only`;
    const except =
      detail?.overriddenBy.map((p) => p.label) ??
      files.workflows.filter((w) => w.scope === "project" && w.name === file.name).map((w) => w.label ?? w.key ?? "");
    return except.length === 0 ? "used by all projects" : `used by all projects except ${except.join(", ")}`;
  }
  const uses = detail?.usedBy ?? [];
  return uses.length === 0 ? "no workflow uses it" : `used by ${uses.map((u) => (u.scope === "project" ? `${u.name} (${u.label ?? u.key})` : u.name)).join(", ")}`;
}

/** The diff from the text the draft started from to its text: 3 context lines, added and removed lines on their colours. */
function Diff({ from, to }: { from: string; to: string }) {
  const patch = useMemo(() => structuredPatch("a", "b", from, to, "", "", { context: 3 }), [from, to]);
  return (
    <div className="max-h-[200px] overflow-auto rounded-md border bg-background font-mono text-[12px]">
      {patch.hunks.map((h) => (
        <div key={`${h.oldStart}:${h.newStart}`}>
          <div className="px-2 text-muted-foreground">{`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`}</div>
          {h.lines.map((l, i) => (
            <div key={i} className={cn("px-2 whitespace-pre", l.startsWith("+") && "bg-[#E9F7EC]", l.startsWith("-") && "bg-[#FDECEC]")}>
              {l}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The three parts edit mode fills: the centre, the right column and the save bar. */
export type EditParts = { centre: ReactNode; facts: ReactNode; bar: ReactNode };

export function EditMode({
  file,
  draft,
  detail,
  onNew,
  layout,
}: {
  file: FileRef;
  draft: Draft;
  detail: FileDetail | undefined;
  onNew: (kind: "workflows" | "steps") => void;
  layout: (parts: EditParts) => ReactNode;
}) {
  const { update, drop } = useDrafts();
  const files = useFiles();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  useUndoKeys(file);
  const [selection, select] = useState<Selection>(null);
  const [yaml, setYaml] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [refused, setRefused] = useState<{ text: string; errors: string[]; warnings: string[] } | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const validation = useValidation(file, draft.text);

  const doc = useMemo(() => parse(draft.text), [draft.text]);
  const workflow = useMemo(() => (file.kind === "workflows" ? workflowSource(doc) : null), [file.kind, doc]);
  const step = useMemo(() => (file.kind === "steps" ? stepSource(doc) : null), [file.kind, doc]);
  const dirty = isDirty(draft);
  const labels = files.data?.projects.map((p) => p.label) ?? [];
  const steps = files.data === undefined ? [] : usableSteps(files.data, file);

  const apply = (op: (d: ReturnType<typeof parse>) => void) =>
    update(file, (text) => {
      const d = parse(text);
      op(d);
      return textOf(d);
    });

  // The lines to show: a refused save's for this text, else the last validation's.
  const errors = refused !== null && refused.text === draft.text ? refused.errors : (validation.result?.errors ?? []);
  const warnings = refused !== null && refused.text === draft.text ? refused.warnings : (validation.result?.warnings ?? []);

  // Each line's card: an entry index, or a construct's path key.
  const nodes = step !== null && !("error" in step) ? flatten(step.nodes) : [];
  const tieOf = (line: string): Selection => {
    const at = locate(line, relOf(file), labels);
    if (at === null) return null;
    if ("entry" in at) return { entry: at.entry };
    const i = deepest(
      nodes.map((n) => chainOf(n.path)),
      at.path,
    );
    return i === -1 ? null : { node: (nodes[i] as StepNode).path };
  };
  const ties = errors.map((line) => ({ line, tie: tieOf(line) }));
  const tiedEntries = new Set(ties.flatMap(({ tie }) => (tie !== null && "entry" in tie ? [tie.entry] : [])));
  const tiedNodes = new Set(ties.flatMap(({ tie }) => (tie !== null && "node" in tie ? [pathKey(tie.node)] : [])));
  const sameTie = (a: Selection, b: Selection): boolean =>
    a !== null && b !== null && (("entry" in a && "entry" in b && a.entry === b.entry) || ("node" in a && "node" in b && pathKey(a.node) === pathKey(b.node)));
  const tiedLines = ties.filter(({ tie }) => sameTie(tie, selection)).map(({ line }) => shownLine(line, labels));

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

  const description = workflow !== null && "entries" in workflow ? (doc.toJS() as { description?: unknown } | null)?.description : step !== null && !("error" in step) ? step.description : null;
  const centre = (
    <>
      <div className="flex flex-wrap items-center gap-3 py-4 pl-6">
        <div className="min-w-0">
          <h1 className="font-mono text-[20px] font-medium break-all">{file.name}</h1>
          {typeof description === "string" && <span className="text-muted-foreground">{description}</span>}
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
          <Button variant="outline" aria-pressed={yaml} onClick={() => setYaml(!yaml)}>
            YAML
          </Button>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center gap-3 bg-muted p-6" onClick={() => select(null)}>
        {yaml ? (
          <pre className="w-full overflow-x-auto rounded-md border bg-background p-3 font-mono text-[13px]">{draft.text}</pre>
        ) : workflow !== null ? (
          "error" in workflow ? (
            <Broken error={workflow.error} text={draft.text} />
          ) : (
            <WorkflowEdit
              entries={workflow.entries}
              steps={steps}
              selected={selection}
              tied={tiedEntries}
              select={select}
              insert={(index, c: NewEntryChoice) => {
                apply((d) => insertEntry(d, index, "step" in c ? c.step : { gate: "Continue?" }));
                select({ entry: index });
              }}
              onNewStep={() => onNew("steps")}
            />
          )
        ) : (
          <StepView
            name={file.name}
            text={draft.text}
            edit={{
              selected: selection,
              tied: tiedNodes,
              select,
              insert: (parent, index, c: Construct) => {
                apply((d) => insertNode(d, parent, index, DEFAULT_CONSTRUCT[c]));
                select({ node: [...parent, index] });
              },
              addParam: () => {
                const name = newParamName(step !== null && !("error" in step) ? step.params.map((p) => p.name) : []);
                apply((d) => setParam(d, name, NEW_PARAM));
                select({ param: name });
              },
            }}
          />
        )}
      </div>
    </>
  );

  const facts = (
    <Settings kind={file.kind} doc={doc} workflow={workflow} steps={steps} selection={selection} select={select} apply={apply} tiedLines={tiedLines} />
  );

  const path = detail?.path ?? (files.data === undefined ? relOf(file) : absoluteOf(files.data, file));
  const status =
    !dirty ? (
      <span className="text-muted-foreground">no changes</span>
    ) : errors.length > 0 ? (
      <span className="text-destructive">{`${errors.length} errors`}</span>
    ) : (
      <span className="text-muted-foreground">{files.data === undefined ? "" : reach(file, detail, files.data)}</span>
    );
  const bar = (
    <div className="flex flex-col gap-2 py-3">
      {conflict && (
        <div className="flex items-center gap-3">
          <span className="text-destructive">Changed on disk since you opened it.</span>
          <Button variant="outline" size="sm" onClick={reload}>
            Reload
          </Button>
        </div>
      )}
      {dirty &&
        (errors.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {ties.map(({ line, tie }, i) => (
              <button
                key={`${i}:${line}`}
                type="button"
                className={cn("text-left font-mono text-[12px] break-words text-destructive", tie !== null && "cursor-pointer hover:underline")}
                disabled={tie === null}
                onClick={() => tie !== null && select(tie)}
              >
                {shownLine(line, labels)}
              </button>
            ))}
          </div>
        ) : (
          <Diff from={draft.start} to={draft.text} />
        ))}
      {dirty &&
        warnings.map((w, i) => (
          <span key={`${i}:${w}`} className="text-[12px] break-words text-muted-foreground">
            {w}
          </span>
        ))}
      <div className="flex items-center gap-3">
        <span className="min-w-0 truncate font-mono text-[13px]">{path}</span>
        <span className="text-[13px]">{status}</span>
        <div className="ml-auto flex shrink-0 gap-2">
          <Button variant="outline" disabled={!dirty || saving} onClick={() => setDiscarding(true)}>
            Discard
          </Button>
          <Button disabled={!canSave} onClick={() => void save()}>
            Save
          </Button>
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
