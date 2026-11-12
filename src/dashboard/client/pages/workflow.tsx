/**
 * A workflow's page, always editable: the header with the Diagram / YAML switch, the status, Diff, Discard, Save and History;
 * then the workflow drawn as a diagram, whose cards open their settings in a panel, or its text in the YAML view. It
 * works on the file's draft, which its first edit starts.
 */
import Panzoom, { type PanzoomEventDetail, type PanzoomObject } from "@panzoom/panzoom";
import { cn } from "cn";
import { RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Document } from "yaml";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { usePromptContext } from "@/files/context";
import { Diagram, NotDrawn, type Selection } from "@/files/Diagram";
import { Diff } from "@/files/Diff";
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

/** A box of check lines: destructive for errors, warning for warnings; at most 160px high, scrolling inside itself. */
function Lines({ lines, tone }: { lines: readonly string[]; tone: "error" | "warning" }) {
  if (lines.length === 0) return null;
  return (
    <ul
      className={cn(
        "flex max-h-[160px] shrink-0 flex-col gap-0.5 overflow-y-auto rounded-lg border px-4 py-2.5 font-mono text-[12px] break-words",
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

/** The scale counts as 100% within this distance of 1: repeated zooms multiply floats. */
const ONE = 0.001;

/** How far, in pixels, a press may move and still be a click. */
const CLICK_SLOP = 5;

/** The view of the diagram: its pan and its scale. */
type PanView = { x: number; y: number; scale: number };

/**
 * Pans and zooms `root`, the diagram's element, inside its parent, the canvas, while `root` is set; `kept` holds the
 * view, which a new instance starts from, `dragging` whether a step is being dragged. Returns the instance, `null`
 * while there is none, and whether the scale is not 100%.
 */
function usePanZoom(root: HTMLElement | null, kept: { current: PanView }, dragging: { current: boolean }): { instance: PanzoomObject | null; zoomed: boolean } {
  const [instance, setInstance] = useState<PanzoomObject | null>(null);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    const canvas = root?.parentElement;
    if (root === null || canvas === null || canvas === undefined) return;
    let dead = false;
    const pz = Panzoom(root, {
      canvas: true,
      cursor: "grab",
      minScale: 0.5,
      maxScale: 2,
      startX: kept.current.x,
      startY: kept.current.y,
      startScale: kept.current.scale,
      // Panzoom writes in an animation frame and its start pan in a timeout, which can run after the cleanup.
      setTransform: (el, { x, y, scale }) => {
        if (!dead) el.style.transform = `scale(${scale}) translate(${x}px, ${y}px)`;
      },
    });
    const onChange = (e: Event) => {
      const { x, y, scale } = (e as CustomEvent<PanzoomEventDetail>).detail;
      kept.current = { x, y, scale };
      setZoomed(Math.abs(scale - 1) >= ONE);
    };
    // Panzoom cancels the press, so the focus would stay where it was: a panel field would keep Ctrl/Cmd+Z.
    const onStart = () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };
    // Only the primary mouse button pans: panzoom 4.6.2 does not look at the button.
    const onOtherButton = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) e.stopPropagation();
    };
    // A drag is not a click: a press that moves more than 5px swallows the click that follows it.
    let start: { x: number; y: number } | null = null;
    let moved = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const far = (e: PointerEvent) => start !== null && Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP;
    const onDown = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY };
      moved = false;
    };
    const onMove = (e: PointerEvent) => {
      if ((e.buttons !== 0 || e.pointerType === "touch") && far(e)) moved = true;
    };
    const onUpCanvas = (e: PointerEvent) => {
      if (far(e)) moved = true;
    };
    const onRelease = () => {
      start = null;
      clearTimeout(timer);
      timer = setTimeout(() => {
        moved = false;
      }, 0);
    };
    const onClick = (e: MouseEvent) => {
      if (e.detail === 0) return;
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
      }
      moved = false;
    };
    // The canvas hides its overflow but still scrolls, to a focused card or a find: an offset becomes a pan.
    const onScroll = () => {
      if (canvas.scrollLeft === 0 && canvas.scrollTop === 0) return;
      const scale = pz.getScale();
      pz.pan(-canvas.scrollLeft / scale, -canvas.scrollTop / scale, { relative: true });
      canvas.scrollLeft = 0;
      canvas.scrollTop = 0;
    };
    // The wheel pans, by its deltas on screen; with Ctrl or Cmd it zooms.
    const onWheel = (e: WheelEvent) => {
      if (dragging.current) return;
      if (e.ctrlKey || e.metaKey) {
        pz.zoomWithWheel(e);
        return;
      }
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
      const scale = pz.getScale();
      pz.pan((-e.deltaX * unit) / scale, (-e.deltaY * unit) / scale, { relative: true });
    };
    root.addEventListener("panzoomchange", onChange);
    root.addEventListener("panzoomstart", onStart);
    canvas.addEventListener("pointerdown", onOtherButton, true);
    canvas.addEventListener("pointerdown", onDown, true);
    addEventListener("pointermove", onMove, true);
    canvas.addEventListener("pointerup", onUpCanvas, true);
    addEventListener("pointerup", onRelease);
    addEventListener("pointercancel", onRelease);
    canvas.addEventListener("click", onClick, true);
    canvas.addEventListener("scroll", onScroll);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    setInstance(pz);
    return () => {
      dead = true;
      root.removeEventListener("panzoomchange", onChange);
      root.removeEventListener("panzoomstart", onStart);
      canvas.removeEventListener("pointerdown", onOtherButton, true);
      canvas.removeEventListener("pointerdown", onDown, true);
      removeEventListener("pointermove", onMove, true);
      canvas.removeEventListener("pointerup", onUpCanvas, true);
      removeEventListener("pointerup", onRelease);
      removeEventListener("pointercancel", onRelease);
      canvas.removeEventListener("click", onClick, true);
      canvas.removeEventListener("scroll", onScroll);
      canvas.removeEventListener("wheel", onWheel);
      clearTimeout(timer);
      pz.destroy();
      pz.resetStyle();
      pz.setStyle("transform", "");
      pz.setStyle("transition", "");
      setInstance(null);
      setZoomed(false);
    };
  }, [root]);
  return { instance, zoomed: instance !== null && zoomed };
}

/** Zooms `pz` one step in (`1`) or out (`-1`) about the centre of `canvas`, stopping at 100% when the step crosses it. */
function zoomStep(pz: PanzoomObject, canvas: HTMLElement, dir: 1 | -1): void {
  const s = pz.getScale();
  let t = Math.min(2, Math.max(0.5, s * Math.exp(0.3 * dir)));
  if ((s < 1 - ONE && t > 1) || (s > 1 + ONE && t < 1) || Math.abs(t - 1) < ONE) t = 1;
  const r = canvas.getBoundingClientRect();
  pz.zoomToPoint(t, { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
}

/** Zoom in, Zoom out and Reset view, in the canvas's bottom-left corner, outside the element panzoom moves. */
function ZoomButtons({ instance, canvas }: { instance: PanzoomObject; canvas: HTMLElement }) {
  return (
    <div className="panzoom-exclude absolute bottom-3 left-3 flex gap-1 rounded-lg border bg-card p-0.5 shadow-xs">
      <Button variant="ghost" size="icon-sm" aria-label="Zoom in" title="Zoom in" onClick={() => zoomStep(instance, canvas, 1)}>
        <ZoomIn />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Zoom out" title="Zoom out" onClick={() => zoomStep(instance, canvas, -1)}>
        <ZoomOut />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Reset view" title="Reset view" onClick={() => instance.reset({ startX: 0, startY: 0, startScale: 1 })}>
        <RotateCcw />
      </Button>
    </div>
  );
}

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
  const main = useRef<HTMLElement>(null);
  // Pan and zoom: the kept view and whether a step is being dragged are refs, so a pan does not render the page.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const kept = useRef<PanView>({ x: 0, y: 0, scale: 1 });
  const dragging = useRef(false);
  const { instance, zoomed } = usePanZoom(root, kept, dragging);

  // Diff shows the unsaved edits; it is unpressed once the draft is clean or dropped, and by any change of view.
  const canDiff = dirty && !draft.isNew;
  const [diffing, setDiffing] = useState(false);
  const [diffView, setDiffView] = useState(view);
  if (diffView !== view) {
    setDiffView(view);
    setDiffing(false);
  }
  if (diffing && !canDiff) setDiffing(false);
  const showDiff = diffing && canDiff;
  // When the Diff button goes while it had the focus, the focus goes to the page rather than staying on the body.
  const hadDiff = useRef(canDiff);
  useLayoutEffect(() => {
    if (hadDiff.current && !canDiff && document.activeElement === document.body) main.current?.focus({ preventScroll: true });
    hadDiff.current = canDiff;
  }, [canDiff]);

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
      onClick={() => setDiffing(false)}
      aria-current={view === to ? "page" : undefined}
      className={cn("rounded-md px-3 py-1 font-medium", view === to ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );

  return (
    <main ref={main} id="content" tabIndex={-1} className="flex h-[calc(100dvh-var(--topbar-h))] flex-1 flex-col outline-none">
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
        {canDiff && (
          <Button variant="outline" aria-pressed={showDiff} className="max-lg:order-3" onClick={() => setDiffing(!showDiff)}>
            {showDiff ? "Back to editing" : "Diff"}
          </Button>
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
      {/* As high as the viewport under the top bar: the canvas, the YAML editor or the diff takes the height left, at
          least 240px, and the panel scrolls inside itself; only a window too short for those 240px scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 lg:p-6">
          {conflict && (
            <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5">
              <span className="mr-auto">Changed on disk since you opened it.</span>
              <Button size="sm" variant="outline" onClick={reload}>
                Reload
              </Button>
            </div>
          )}
          {showDiff ? (
            <>
              <Lines lines={errors.map((l) => withoutPrefix(l, file.name))} tone="error" />
              <Lines lines={warnings} tone="warning" />
              <Diff from={draft.start} to={text} className="max-h-none min-h-[240px] flex-1" />
            </>
          ) : view === "yaml" ? (
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
              <div className="wf-canvas relative min-h-[240px] flex-1 overflow-hidden rounded-xl p-4 lg:p-6">
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
                    rootRef={setRoot}
                    zoomed={zoomed}
                    onDragging={(d) => {
                      dragging.current = d;
                    }}
                  />
                )}
                {instance !== null && root?.parentElement && (
                  <ZoomButtons instance={instance} canvas={root.parentElement} />
                )}
              </div>
            </>
          )}
        </div>
        {view === "diagram" && !showDiff && panel !== null && wide && (
          <aside aria-label={selected === "workflow" ? "Workflow settings" : "Step"} className="w-[360px] shrink-0 overflow-auto border-l border-divider p-5">
            {panel}
          </aside>
        )}
      </div>
      <Dialog open={view === "diagram" && !showDiff && panel !== null && !wide} onOpenChange={(o) => !o && close()}>
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
