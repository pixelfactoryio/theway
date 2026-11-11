import { cn } from "cn";
import { type ReactNode, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isDirty } from "@/files/draft";
import { useDrafts } from "@/files/drafts";
import { EditMode } from "@/files/EditMode";
import { FilesColumn, FilesSheet } from "@/files/FileList";
import { Confirm } from "@/files/fields";
import { NewDialog } from "@/files/NewDialog";
import { TitleRow } from "@/files/TitleRow";
import { History } from "@/files/History";
import { Panel, WorkflowPanels, WorkflowView } from "@/files/WorkflowView";
import { editHref, type FileRef, fileHref, fileKey, relOf, useFile, useFiles, versionsHref } from "@/lib/api";
import { MAX_PART, pathParts, shownPath } from "@/lib/path";
import type { FileDetail } from "../../types";

/** The width of the Workflows pages' container; the Changes pages keep 1120px. */
export const WIDE = "max-w-[1400px]";

/** A path that breaks only after a `/`; a part too long for the panel breaks anywhere. */
function PathText({ path }: { path: string }) {
  return (
    <span className="font-mono text-[12px]">
      {pathParts(path).map((part, i) => (
        <span key={`${i}:${part}`} className={part.length > MAX_PART ? "break-all" : "whitespace-nowrap"}>
          {part}
          <wbr />
        </span>
      ))}
    </span>
  );
}

/** The File panel: the file's path from the home, and what overrides it or what it overrides. */
function FilePanel({ detail }: { detail: FileDetail }) {
  const files = useFiles();
  return (
    <Panel title="File">
      <PathText path={files.data === undefined ? detail.path : shownPath(files.data.home, relOf(detail))} />
      {detail.scope === "global" ? (
        <span className="text-[12px] text-muted-foreground">
          {detail.overriddenBy.length > 0 ? `Overridden in ${detail.overriddenBy.map((p) => p.label).join(", ")}` : "Not overridden in any project"}
        </span>
      ) : (
        <span className="text-[12px] text-muted-foreground">
          {detail.label ?? detail.key} only{detail.overrides && ` · replaces the global ${detail.name}`}
        </span>
      )}
    </Panel>
  );
}

/** The right column of a workflow: its Step defaults, Inputs and File panels. */
function Facts({ detail }: { detail: FileDetail }) {
  return (
    <div className="flex flex-col gap-3">
      {detail.kind === "workflows" && "doc" in detail.resolved && <WorkflowPanels doc={detail.resolved.doc} />}
      <FilePanel detail={detail} />
    </div>
  );
}

/** The banner of a file's view while it has unsaved edits: Continue editing, or Discard changes after a confirm. */
function DraftBanner({ file }: { file: FileRef }) {
  const [, navigate] = useLocation();
  const { drop } = useDrafts();
  const [discarding, setDiscarding] = useState(false);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 lg:mx-6">
      <span className="mr-auto">You have unsaved changes to this file</span>
      <Button size="sm" variant="ghost" onClick={() => setDiscarding(true)}>
        Discard changes
      </Button>
      <Button size="sm" onClick={() => navigate(editHref(file))}>
        Continue editing
      </Button>
      <Confirm open={discarding} title={`Discard your changes to ${file.name}?`} action="Discard changes" onConfirm={() => drop(file)} onClose={() => setDiscarding(false)} />
    </div>
  );
}

/** The centre: the title row, Versions, the Visual and YAML control and Edit, then the drawing or the file's text. */
function Centre({ file, detail }: { file: FileRef; detail: FileDetail }) {
  const [source, setSource] = useState(false);
  const [, navigate] = useLocation();
  const { drafts, start } = useDrafts();
  const draft = drafts.get(fileKey(file))?.draft;
  return (
    <>
      {draft !== undefined && isDirty(draft) && <DraftBanner file={file} />}
      <TitleRow
        title={<h1 className="font-mono text-[20px] font-medium break-all">{file.name}</h1>}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(versionsHref(file))}>
              Versions
            </Button>
            <Tabs value={source ? "source" : "visual"} onValueChange={(v) => setSource(v === "source")}>
              <TabsList>
                <TabsTrigger value="visual" className="px-3">
                  Visual
                </TabsTrigger>
                <TabsTrigger value="source" className="px-3">
                  YAML
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              onClick={() => {
                // A dirty draft, reachable from versions mode, is kept.
                if (draft === undefined || !isDirty(draft)) start(file, detail.text, detail.sha256, false);
                navigate(editHref(file));
              }}
            >
              Edit
            </Button>
          </>
        }
      >
        {detail.description !== null && <span className="text-muted-foreground">{detail.description}</span>}
      </TitleRow>
      <div className="flex flex-1 flex-col items-center gap-3 pb-6 lg:px-6">
        {source ? (
          <pre className="w-full overflow-x-auto rounded-lg border bg-card p-3 font-mono text-[13px]">{detail.text}</pre>
        ) : (
          detail.kind === "workflows" && <WorkflowView file={file} resolved={detail.resolved} text={detail.text} />
        )}
      </div>
    </>
  );
}

/**
 * The three columns: the file list, the centre with the save bar of edit mode at its end, and the right column
 * (`factsLabel`); then the Create dialog, its project preselected from `project`. Below the `lg` breakpoint the centre
 * and the right column stack, and the file list opens from the title row's Files button.
 */
function Columns({
  selected,
  project,
  centre,
  facts,
  factsLabel = "Facts",
  bar,
}: {
  selected: FileRef | null;
  project: string;
  centre: ReactNode;
  facts: ReactNode;
  factsLabel?: string;
  bar?: ReactNode;
}) {
  const [creating, setCreating] = useState(false);
  const onNew = () => setCreating(true);
  return (
    <FilesSheet selected={selected} onNew={onNew}>
      <div className={cn("mx-auto flex w-full flex-1 flex-col px-6 max-lg:pb-(--savebar-h) lg:flex-row", WIDE)}>
        <FilesColumn selected={selected} onNew={onNew} />
        <main id="content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
          {centre}
          {bar}
        </main>
        <aside id="facts" aria-label={factsLabel} className="border-t border-divider py-4 lg:w-[280px] lg:shrink-0 lg:border-t-0 lg:border-l lg:pl-4">
          {facts}
        </aside>
      </div>
      <NewDialog kind={creating ? "workflows" : null} project={project} onClose={() => setCreating(false)} />
    </FilesSheet>
  );
}

/** `/workflows`: the first workflow of the list. */
export function WorkflowsIndex({ project }: { project: string }) {
  const files = useFiles();
  const first = files.data?.workflows[0];
  if (first !== undefined) return <Redirect to={fileHref(first)} replace />;
  return (
    <Columns
      selected={null}
      project={project}
      centre={
        files.data !== undefined && (
          <>
            <TitleRow title={<h1 className="text-[20px] font-semibold">Workflows</h1>} actions={null} />
            <Empty>No workflows</Empty>
          </>
        )
      }
      facts={null}
    />
  );
}

/** The mode of the Workflows page: the workflow's view, its edit mode, or its history with one version selected (`null` for Current). */
export type Mode = { view: true } | { edit: true } | { version: string | null };

/**
 * The Workflows page with one workflow selected, in view, edit or history mode. The view of a file with a dirty draft
 * says so above the title; a new file's view, with nothing on disk to show, opens edit mode; edit mode without a
 * draft goes back to the view.
 */
export function WorkflowsPage({ file, mode, project }: { file: FileRef; mode: Mode; project: string }) {
  const { drafts } = useDrafts();
  const draft = drafts.get(fileKey(file))?.draft;
  const detail = useFile(file, draft === undefined || !draft.isNew);
  const loading = detail.data === undefined ? <Empty error={detail.isError}>{detail.isError ? detail.error.message : "Loading…"}</Empty> : null;
  if ("version" in mode) return <History file={file} id={mode.version} />;
  if ("view" in mode && draft !== undefined && draft.isNew) return <Redirect to={editHref(file)} replace />;
  if ("edit" in mode && draft === undefined) return <Redirect to={fileHref(file)} replace />;
  if ("edit" in mode && draft !== undefined) {
    return (
      <EditMode
        file={file}
        draft={draft}
        detail={detail.data}
        layout={({ centre, facts, bar }) => <Columns selected={file} project={project} centre={centre} facts={facts} factsLabel="Settings" bar={bar} />}
      />
    );
  }
  return (
    <Columns
      selected={file}
      project={project}
      centre={loading ?? <Centre key={fileKey(file)} file={file} detail={detail.data as FileDetail} />}
      facts={detail.data !== undefined && <Facts detail={detail.data} />}
    />
  );
}
