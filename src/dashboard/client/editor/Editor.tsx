/**
 * The workflow editor at `#/p/<key>/workflows/<name>/edit`: the palette, the canvas with its `+` points, the inspector
 * forms, the live YAML, validation as you edit, Save, Discard, Revert to global, undo and redo.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, Redo2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link } from "wouter";
import type { Document } from "yaml";
import { Empty, PageHeader } from "@/components/state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Canvas } from "@/graph/Canvas";
import { toFlow } from "@/graph/flow";
import { layout } from "@/graph/layout";
import { find, type InsertPoint } from "@/graph/model";
import { revertFile, saveFiles, usePrompts, useSource, useStepSources, useSteps, validateFiles } from "@/lib/api";
import { setLeaveGuard } from "@/lib/leave";
import { useLabel } from "@/lib/projects";
import type { SourceKind, ValidateResponse } from "../../types";
import { Confirm, type ConfirmAsk, type Inserted, InsertDialog, NewFileDialog } from "./dialogs";
import { EditInspector } from "./Inspector";
import { fits, type Item } from "./items";
import { EditorContext, type EditorApi, editorNodeTypes } from "./nodes";
import { insertEntry, insertNode, moveEntry, newStepText, parse } from "./ops";
import { Palette } from "./Palette";
import { clearPendingWorkflow, pendingWorkflow } from "./pending";
import { fileKey, type StepSource, sourceModel } from "./source";
import { applyOp, type EditFile, fromSource, initialState, isDirty, newFile, reducer } from "./state";

/** The step names a workflow document's entries name, in order, without repeats; gates left out. */
function namedSteps(doc: Document | undefined): string[] {
  const root = doc?.toJS() as { steps?: unknown } | null | undefined;
  if (!Array.isArray(root?.steps)) return [];
  const names = root.steps.flatMap((e: unknown) => (e !== null && typeof e === "object" && !Array.isArray(e) ? Object.keys(e) : []));
  return [...new Set(names.filter((n) => n !== "gate"))];
}

/** The documents of the open files by key, each parsed once per text. */
function useDocs(files: Record<string, EditFile>): Record<string, Document> {
  const cache = useRef(new Map<string, Document>());
  return useMemo(() => {
    const next = new Map<string, Document>();
    const out: Record<string, Document> = {};
    for (const f of Object.values(files)) {
      const doc = cache.current.get(f.text) ?? parse(f.text);
      next.set(f.text, doc);
      out[f.key] = doc;
    }
    cache.current = next;
    return out;
  }, [files]);
}

/** The project path a file saves to, under the project label. */
const target = (label: string, f: { kind: SourceKind; name: string }) => `projects/${label}/${f.kind}/${f.name}.yaml`;

/** A save or revert that did not go through: a conflict, or the resolver's lines. */
type Refusal = { conflict: true } | { errors: string[] };

export function EditPage({ projectKey, name }: { projectKey: string; name: string }) {
  const label = useLabel(projectKey);
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reducer, initialState);
  const wfKey = fileKey("workflows", name);
  const wfQuery = useSource(projectKey, "workflows", name);
  const stepsList = useSteps(projectKey);
  const promptList = usePrompts(projectKey);
  const steps = useMemo(() => (Array.isArray(stepsList.data) ? stepsList.data : []), [stepsList.data]);
  const prompts = useMemo(() => (promptList.data ?? []).map((p) => p.name), [promptList.data]);

  useEffect(() => {
    if (state.files[wfKey] !== undefined || wfQuery.data === undefined) return;
    if (wfQuery.data !== null) dispatch({ type: "load", file: fromSource(wfQuery.data) });
    else {
      const text = pendingWorkflow(projectKey, name);
      if (text !== undefined) dispatch({ type: "load", file: newFile("workflows", name, text) });
    }
  }, [state.files, wfKey, wfQuery.data, projectKey, name]);

  const docs = useDocs(state.files);
  const wfDoc = docs[wfKey];
  const named = useMemo(() => namedSteps(wfDoc), [wfDoc]);
  const fetchedKey = named.filter((n) => state.files[fileKey("steps", n)]?.origin !== "new").join(" ");
  const fetched = useMemo(() => (fetchedKey === "" ? [] : fetchedKey.split(" ")), [fetchedKey]);
  const stepQueries = useStepSources(projectKey, fetched);
  useEffect(() => {
    for (const q of stepQueries) {
      if (q.data !== undefined && q.data !== null && state.files[fileKey("steps", q.data.name)] === undefined) {
        dispatch({ type: "load", file: fromSource(q.data) });
      }
    }
  }, [stepQueries, state.files]);

  const sources = useMemo(() => {
    const out = new Map<string, StepSource>();
    for (const n of named) {
      const f = state.files[fileKey("steps", n)];
      const doc = docs[fileKey("steps", n)];
      if (f !== undefined && doc !== undefined) {
        out.set(n, { doc, origin: f.origin === "global" ? "global" : "project", editable: f.editable });
        continue;
      }
      const q = stepQueries[fetched.indexOf(n)];
      if (q?.error) out.set(n, { error: q.error });
      else if (q?.data === undefined) out.set(n, { error: "Loading…" });
    }
    return out;
  }, [named, fetched, state.files, docs, stepQueries]);

  const graph = useMemo(() => (wfDoc === undefined ? null : sourceModel(name, wfDoc, sources)), [name, wfDoc, sources]);
  const flow = useMemo(() => (graph === null || "error" in graph ? null : toFlow(layout(graph, { inserts: true }))), [graph]);
  const [selected, setSelected] = useState<string | null>(null);
  const close = useCallback(() => setSelected(null), []);
  const shown = graph === null || "error" in graph || selected === null ? null : find(graph, selected)?.node;

  const edit = useCallback(
    (key: string, op: (doc: Document) => void) => {
      const f = state.files[key];
      if (f === undefined || !f.editable) return;
      dispatch({ type: "edit", key, text: applyOp(f, op) });
    },
    [state.files],
  );

  // Validation, 400 ms after the last edit, of every dirty file.
  const dirty = Object.values(state.files).filter(isDirty);
  const dirtyKey = JSON.stringify(dirty.map((f) => [f.key, f.text]));
  const [checked, setChecked] = useState<{ key: string; result: ValidateResponse } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const validation = useMutation({ mutationFn: (files: EditFile[]) => validateFiles(projectKey, files.map(({ kind, name: n, text }) => ({ kind, name: n, text })), name) });
  const { mutate: validate } = validation;
  useEffect(() => {
    if (dirty.length === 0) return;
    const files = dirty;
    const key = dirtyKey;
    const timer = setTimeout(() => {
      validate(files, {
        onSuccess: (result) => {
          setChecked({ key, result });
          setCheckError(null);
        },
        onError: (e) => setCheckError(e.message),
      });
    }, 400);
    return () => clearTimeout(timer);
    // `dirtyKey` stands for the dirty files.
  }, [dirtyKey, validate]);
  const current = checked?.key === dirtyKey ? checked.result : null;
  const valid = current?.ok === true;

  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [ask, setAsk] = useState<ConfirmAsk | null>(null);

  /** Reloads every source of the project from the server, dropping the edits. */
  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sources", projectKey] }),
      queryClient.invalidateQueries({ queryKey: ["workflows", projectKey] }),
      queryClient.invalidateQueries({ queryKey: ["workflow", projectKey, name] }),
      queryClient.invalidateQueries({ queryKey: ["steps", projectKey] }),
    ]);
    setRefusal(null);
    setChecked(null);
    setSelected(null);
    dispatch({ type: "reset" });
  }, [queryClient, projectKey, name]);

  const save = useMutation({
    mutationFn: () => saveFiles(projectKey, dirty.map(({ kind, name: n, text, base }) => ({ kind, name: n, text, base }))),
    onSuccess: async (r) => {
      if (r.status === 200) {
        clearPendingWorkflow(projectKey, name);
        await reload();
      } else if ("conflicts" in r.body) setRefusal({ conflict: true });
      else if ("errors" in r.body) setRefusal({ errors: r.body.errors });
    },
    onError: (e) => setRefusal({ errors: [e.message] }),
  });

  const revert = useCallback(
    (kind: SourceKind, n: string) => {
      const f = state.files[fileKey(kind, n)];
      if (f === undefined || f.base === null) return;
      const base = f.base;
      setAsk({
        title: "Revert to global?",
        text: `This deletes ${target(label, f)}; the project uses the global ${kind === "workflows" ? "workflow" : "step"} again.`,
        action: "Revert",
        onConfirm: () => {
          void revertFile(projectKey, kind, n, base)
            .then(async (r) => {
              if (r.status === 200) await reload();
              else if ("conflicts" in r.body) setRefusal({ conflict: true });
              else if ("errors" in r.body) setRefusal({ errors: r.body.errors });
            })
            .catch((e: Error) => setRefusal({ errors: [e.message] }));
        },
      });
    },
    [state.files, label, projectKey, reload],
  );

  // Leaving with unsaved edits: the browser's prompt on unload, a confirm on in-app navigation.
  const unsaved = dirty.length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    setLeaveGuard((proceed) => setAsk({ title: "Leave with unsaved edits?", text: "Your edits are not saved and will be lost.", action: "Leave", onConfirm: proceed }));
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      setLeaveGuard(null);
    };
  }, [unsaved]);

  // Undo and redo: Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]") !== null) return;
      e.preventDefault();
      dispatch({ type: e.shiftKey ? "redo" : "undo" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [inserting, setInserting] = useState<{ at: InsertPoint; item: Item; id: number } | null>(null);
  const [newStep, setNewStep] = useState(0);
  const api = useMemo<EditorApi>(
    () => ({
      steps: [...new Set([...steps.map((s) => s.name), ...Object.values(state.files).filter((f) => f.kind === "steps" && f.origin === "new").map((f) => f.name)])].sort(),
      insert: (at, item) => {
        if (!fits(item, at)) return;
        if (item.type === "step" && at.scope === "entries") edit(wfKey, (d) => insertEntry(d, at.index, item.name));
        else setInserting({ at, item, id: Date.now() });
      },
      move: (from, at) => {
        if (at.scope !== "entries") return;
        const to = from < at.index ? at.index - 1 : at.index;
        if (to !== from) edit(wfKey, (d) => moveEntry(d, from, to));
      },
      editCopy: (step) => dispatch({ type: "editable", key: fileKey("steps", step) }),
    }),
    [steps, state.files, edit, wfKey],
  );
  const onInserted = (v: Inserted) => {
    const at = inserting?.at;
    setInserting(null);
    if (at === undefined) return;
    if ("gate" in v) {
      if (at.scope === "entries") edit(wfKey, (d) => insertEntry(d, at.index, { gate: v.gate }));
    } else if (at.scope === "step") edit(at.file, (d) => insertNode(d, at.parent, at.index, v.node));
  };

  const wf = state.files[wfKey];
  if (wf === undefined) {
    const missing = wfQuery.data === null;
    return (
      <>
        <PageHeader project={label} crumbs="Workflows" />
        <Empty error={wfQuery.isError || missing}>{wfQuery.isError ? wfQuery.error.message : missing ? `No workflow '${name}'.` : "Loading…"}</Empty>
      </>
    );
  }
  const files = [wf, ...Object.values(state.files).filter((f) => f.kind === "steps" && (named.includes(f.name) || isDirty(f)))];
  const dirtySteps = dirty.filter((f) => f.kind === "steps");
  const errors = refusal !== null && "errors" in refusal ? refusal.errors : (current?.errors ?? []);
  const stepTaken = [...steps.map((s) => s.name), ...Object.values(state.files).filter((f) => f.kind === "steps").map((f) => f.name)];

  return (
    <EditorContext.Provider value={api}>
      <Tabs defaultValue="graph" className="flex h-svh min-h-0 flex-col gap-0">
        <PageHeader
          project={label}
          crumbs={
            <>
              <Link href={`/p/${projectKey}/workflows`} className="font-normal text-muted-foreground hover:underline">
                Workflows
              </Link>
              <span className="px-2 text-muted-foreground/60">/</span>
              <Link href={`/p/${projectKey}/workflows/${name}`} className="font-mono font-normal hover:underline">
                {name}
              </Link>
              <span className="px-2 text-muted-foreground/60">/</span>
              Edit
            </>
          }
        >
          {unsaved &&
            (current === null ? (
              <Badge variant="outline">{checkError ?? "Checking…"}</Badge>
            ) : valid ? (
              <Badge variant="outline" className="border-[#BBF7D0] text-[#15803D]">
                <CircleCheck /> Valid
              </Badge>
            ) : (
              <Badge variant="destructive">
                <CircleX /> {current.errors.length} {current.errors.length === 1 ? "error" : "errors"}
              </Badge>
            ))}
          <Button variant="ghost" size="icon-sm" aria-label="Undo" disabled={state.undo.length === 0} onClick={() => dispatch({ type: "undo" })}>
            <Undo2 />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Redo" disabled={state.redo.length === 0} onClick={() => dispatch({ type: "redo" })}>
            <Redo2 />
          </Button>
          <TabsList>
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
          </TabsList>
          {wf.origin === "project" && wf.globalPath !== null && (
            <Button variant="ghost" size="sm" onClick={() => revert("workflows", name)}>
              Revert to global
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!unsaved}
            onClick={() => setAsk({ title: "Discard your edits?", text: "This reloads every file from disk.", action: "Discard", onConfirm: () => void reload() })}
          >
            Discard
          </Button>
          <Button size="sm" disabled={!unsaved || !valid || save.isPending} onClick={() => save.mutate()}>
            Save {dirty.length} {dirty.length === 1 ? "file" : "files"}
          </Button>
        </PageHeader>
        <div className="flex flex-col gap-2 border-b px-4 py-2 text-[12px]">
          <p className="text-muted-foreground">
            Saves to <span className="font-mono">{target(label, wf)}</span>
            {dirtySteps.map((f) => (
              <span key={f.key}>
                , <span className="font-mono">{target(label, f)}</span>
              </span>
            ))}
            : this project only.
          </p>
          {refusal !== null && "conflict" in refusal && (
            <Alert variant="destructive">
              <AlertTitle>Changed on disk since you opened it</AlertTitle>
              <AlertDescription className="flex items-center gap-3">
                Reload to see the files as they are now; your edits are discarded.
                <Button size="sm" variant="outline" onClick={() => void reload()}>
                  Reload
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {unsaved && errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>{refusal !== null ? "Not saved" : "Does not resolve"}</AlertTitle>
              <AlertDescription>
                <ul className="font-mono text-[12px]">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {unsaved && current !== null && current.warnings.length > 0 && (
            <ul className="font-mono text-muted-foreground">
              {current.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
        <TabsContent value="graph" className="flex min-h-0 grow">
          <Palette
            steps={[...steps, ...Object.values(state.files).filter((f) => f.kind === "steps" && f.origin === "new").map((f) => ({ name: f.name, origin: "project" as const, error: "new" }))]}
            onNewStep={() => setNewStep((n) => n + 1)}
          />
          <div className="min-w-0 grow">
            {graph !== null && "error" in graph ? (
              <Empty error>{graph.error}</Empty>
            ) : flow === null ? (
              <Empty>Loading…</Empty>
            ) : (
              <Canvas nodes={flow.nodes} edges={flow.edges} selected={selected} onSelect={setSelected} types={editorNodeTypes} />
            )}
          </div>
          {shown !== null && shown !== undefined && shown.kind !== "insert" && (
            <EditInspector
              node={shown}
              workflow={wfKey}
              docs={docs}
              entries={graph !== null && !("error" in graph) ? graph.entries.length : 0}
              steps={steps}
              prompts={prompts}
              edit={edit}
              confirm={setAsk}
              onClose={close}
              revertStep={(step) => {
                const f = state.files[fileKey("steps", step)];
                if (f?.globalPath !== null && f?.origin === "project") revert("steps", step);
              }}
            />
          )}
        </TabsContent>
        <TabsContent value="yaml" className="min-h-0 grow overflow-auto p-6">
          <div className="flex flex-col gap-6">
            {files.map((f) => (
              <section key={f.key} className="flex flex-col gap-2">
                <p className="font-mono text-[12px] text-muted-foreground">
                  {target(label, f)}
                  {isDirty(f) && " · edited"}
                  {!f.editable && " · global, read-only"}
                </p>
                <pre className="rounded-md border bg-muted p-4 font-mono text-[12px] leading-relaxed">{f.text}</pre>
              </section>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <InsertDialog key={inserting?.id ?? 0} item={inserting?.item ?? null} prompts={prompts} onCancel={() => setInserting(null)} onSubmit={onInserted} />
      <NewFileDialog
        key={`step-${newStep}`}
        open={newStep > 0}
        kind="step"
        taken={stepTaken}
        prompts={prompts}
        onCancel={() => setNewStep(0)}
        onSubmit={(v) => {
          dispatch({ type: "load", file: newFile("steps", v.name, newStepText(v.description, v.prompt, v.returns)) });
          setNewStep(0);
        }}
      />
      <Confirm ask={ask} onClose={() => setAsk(null)} />
    </EditorContext.Provider>
  );
}
