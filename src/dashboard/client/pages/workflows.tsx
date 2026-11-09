import { cn } from "cn";
import { type ReactNode, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { isDirty } from "@/files/draft";
import { useDrafts } from "@/files/drafts";
import { EditMode } from "@/files/EditMode";
import { NewDialog } from "@/files/NewDialog";
import { StepView } from "@/files/StepView";
import { VersionList, VersionView } from "@/files/Versions";
import { WorkflowView } from "@/files/WorkflowView";
import { editHref, type FileRef, fileHref, fileKey, useFile, useFiles, versionsHref } from "@/lib/api";
import type { FileDetail, FileItem } from "../../types";

type Kind = FileItem["kind"];

const sameFile = (a: FileRef, b: FileRef): boolean => a.scope === b.scope && a.key === b.key && a.kind === b.kind && a.name === b.name;

/** The note on an item's right: `default`, `<label> only` and ` · default`; `null` for none. */
function itemNote(item: FileItem): string | null {
  if (item.scope === "global") return item.default ? "default" : null;
  return `${item.label ?? item.key ?? ""} only${item.default ? " · default" : ""}`;
}

/** An item of the list; `mark` is `edited` or `new` for a file with a draft. */
function Item({ item, selected, mark }: { item: FileItem; selected: boolean; mark: "edited" | "new" | null }) {
  const note = itemNote(item);
  return (
    <Link
      href={fileHref(item)}
      aria-current={selected ? "page" : undefined}
      className={cn("flex items-baseline justify-between gap-2 rounded-md px-2.5 py-1.5", selected ? "bg-accent" : "hover:bg-accent")}
    >
      <span className="truncate font-mono text-[13px]">{item.name}</span>
      {mark !== null ? (
        <span className="shrink-0 text-[12px] text-muted-foreground">{mark}</span>
      ) : item.error !== null ? (
        <span className="shrink-0 text-[12px] text-destructive" title={item.error}>
          error
        </span>
      ) : (
        note !== null && <span className="shrink-0 text-[12px] text-muted-foreground">{note}</span>
      )}
    </Link>
  );
}

/**
 * The file list: the workflows, then the steps, in the response's order, each group followed by its new files and
 * its New button.
 */
function FileList({ selected, onNew }: { selected: FileRef | null; onNew: (kind: Kind) => void }) {
  const files = useFiles();
  const { drafts } = useDrafts();
  if (files.data === undefined) return <Empty error={files.isError}>{files.isError ? files.error.message : "Loading…"}</Empty>;
  const labels = new Map(files.data.projects.map((p) => [p.key, p.label]));
  const group = (heading: string, kind: Kind, items: FileItem[], first: boolean) => {
    const fresh = [...drafts.values()]
      .filter((e) => e.draft.isNew && e.file.kind === kind)
      .map(
        (e): FileItem => ({
          ...e.file,
          label: e.file.key === null ? null : (labels.get(e.file.key) ?? null),
          path: "",
          description: null,
          default: false,
          error: null,
        }),
      );
    const mark = (item: FileItem) => {
      const d = drafts.get(fileKey(item))?.draft;
      return d === undefined || !isDirty(d) ? null : d.isNew ? "new" : "edited";
    };
    return (
      <>
        <div className={cn("px-2.5 pb-1 text-[12px] text-muted-foreground", first ? "" : "pt-3.5")}>{heading}</div>
        {[...items, ...fresh].map((item) => (
          <Item key={fileKey(item)} item={item} selected={selected !== null && sameFile(item, selected)} mark={mark(item)} />
        ))}
        <Button variant="ghost" className="justify-start text-muted-foreground" onClick={() => onNew(kind)}>
          {kind === "workflows" ? "New workflow" : "New step"}
        </Button>
      </>
    );
  };
  return (
    <nav aria-label="Files" className="flex flex-col gap-px">
      {group("Workflows", "workflows", files.data.workflows, true)}
      {group("Steps", "steps", files.data.steps, false)}
    </nav>
  );
}

/** A labelled block of the facts column. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium">{label}</span>
      {children}
    </div>
  );
}

/** The facts column: the file's path, what uses it, and its warnings. */
function Facts({ detail }: { detail: FileDetail }) {
  return (
    <div className="flex flex-col gap-3.5">
      <Fact label="File">
        <span className="font-mono text-[13px] break-all">{detail.path}</span>
      </Fact>
      {detail.kind === "workflows" ? (
        <Fact label="Used by">
          {detail.scope === "global" ? (
            <span>
              all projects
              {detail.overriddenBy.length > 0 && ` except ${detail.overriddenBy.map((p) => p.label).join(", ")}`}
            </span>
          ) : (
            <>
              <span>{detail.label ?? detail.key} only</span>
              {detail.overrides && <span>replaces the global {detail.name}</span>}
            </>
          )}
        </Fact>
      ) : (
        <Fact label="Used by">
          {detail.usedBy.length === 0 ? (
            <span>no workflow</span>
          ) : (
            detail.usedBy.map((u) => (
              <Link
                key={`${u.scope}/${u.key ?? ""}/${u.name}`}
                href={fileHref({ scope: u.scope, key: u.key, kind: "workflows", name: u.name })}
                className="underline"
              >
                {u.name}
                {u.scope === "project" && ` (${u.label ?? u.key})`}
              </Link>
            ))
          )}
        </Fact>
      )}
      {detail.warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {detail.warnings.map((w) => (
            <span key={`${w.file}: ${w.text}`} className="text-[12px] text-muted-foreground break-words">
              {w.file}: {w.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The centre: the title row with Edit, Versions and the YAML switch, then the drawing or the file's text. */
function Centre({ file, detail }: { file: FileRef; detail: FileDetail }) {
  const [yaml, setYaml] = useState(false);
  const { drafts, start } = useDrafts();
  const draft = drafts.get(fileKey(file))?.draft;
  const [, navigate] = useLocation();
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 py-4 pl-6">
        <div className="min-w-0">
          <h1 className="font-mono text-[20px] font-medium break-all">{file.name}</h1>
          {detail.description !== null && <span className="text-muted-foreground">{detail.description}</span>}
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            onClick={() => {
              // A dirty draft, reachable from versions mode, is kept.
              if (draft === undefined || !isDirty(draft)) start(file, detail.text, detail.sha256, false);
              navigate(editHref(file));
            }}
          >
            Edit
          </Button>
          <Button variant="outline" onClick={() => navigate(versionsHref(file))}>
            Versions
          </Button>
          <Button variant="outline" aria-pressed={yaml} onClick={() => setYaml(!yaml)}>
            YAML
          </Button>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center gap-3 bg-muted p-6">
        {yaml ? (
          <pre className="w-full overflow-x-auto rounded-md border bg-background p-3 font-mono text-[13px]">{detail.text}</pre>
        ) : detail.kind === "workflows" ? (
          <WorkflowView detail={detail} />
        ) : (
          <StepView name={detail.name} text={detail.text} />
        )}
      </div>
    </>
  );
}

/**
 * The three columns: the file list, the centre and the right column (`factsLabel`), then the save bar in edit mode;
 * the New dialog opens from the list or from `onNew`.
 */
function Columns({
  selected,
  centre,
  facts,
  factsLabel = "Facts",
  bar,
  newKind,
  setNewKind,
}: {
  selected: FileRef | null;
  centre: ReactNode;
  facts: ReactNode;
  factsLabel?: string;
  bar?: ReactNode;
  newKind: Kind | null;
  setNewKind: (k: Kind | null) => void;
}) {
  const files = useFiles();
  return (
    <>
      <div className="mx-auto flex w-full max-w-[1120px] flex-1 px-6">
        <aside aria-label="Files" className="w-[280px] shrink-0 border-r border-divider py-4 pr-4">
          <FileList selected={selected} onNew={setNewKind} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">{centre}</main>
        <aside aria-label={factsLabel} className="w-[280px] shrink-0 border-l border-divider py-4 pl-4">
          {facts}
        </aside>
      </div>
      {bar !== undefined && (
        <div className="sticky bottom-0 bg-background">
          <div className="mx-auto w-full max-w-[1120px] px-6">
            <div className="border-t border-divider">{bar}</div>
          </div>
        </div>
      )}
      <NewDialog kind={newKind} files={files.data} open={selected} onClose={() => setNewKind(null)} />
    </>
  );
}

/** `/workflows`: the first workflow of the list. */
export function WorkflowsIndex() {
  const files = useFiles();
  const [newKind, setNewKind] = useState<Kind | null>(null);
  const first = files.data?.workflows[0];
  if (first !== undefined) return <Redirect to={fileHref(first)} replace />;
  return <Columns selected={null} centre={files.data !== undefined && <Empty>No workflows</Empty>} facts={null} newKind={newKind} setNewKind={setNewKind} />;
}

/** The mode of the Workflows page: the file's view, its edit mode, or its versions with one selected (`null` for Current). */
export type Mode = { view: true } | { edit: true } | { version: string | null };

/**
 * The Workflows page with one file selected, in view, edit or versions mode. The view of a file with a dirty draft
 * opens edit mode; edit mode without a draft goes back to the view. Versions mode has no save bar.
 */
export function WorkflowsPage({ file, mode }: { file: FileRef; mode: Mode }) {
  const { drafts } = useDrafts();
  const draft = drafts.get(fileKey(file))?.draft;
  const detail = useFile(file, draft === undefined || !draft.isNew);
  const [newKind, setNewKind] = useState<Kind | null>(null);
  const editing = "edit" in mode;
  if ("version" in mode) {
    const loaded =
      detail.data === undefined ? <Empty error={detail.isError}>{detail.isError ? detail.error.message : "Loading…"}</Empty> : null;
    return (
      <Columns
        selected={file}
        centre={
          loaded ??
          (mode.version === null ? (
            <Centre key={fileKey(file)} file={file} detail={detail.data as FileDetail} />
          ) : (
            <VersionView key={mode.version} file={file} id={mode.version} detail={detail.data as FileDetail} />
          ))
        }
        facts={<VersionList file={file} id={mode.version} />}
        factsLabel="Versions"
        newKind={newKind}
        setNewKind={setNewKind}
      />
    );
  }
  if (!editing && draft !== undefined && isDirty(draft)) return <Redirect to={editHref(file)} replace />;
  if (editing && draft === undefined) return <Redirect to={fileHref(file)} replace />;
  if (editing && draft !== undefined) {
    return (
      <EditMode
        file={file}
        draft={draft}
        detail={detail.data}
        onNew={setNewKind}
        layout={({ centre, facts, bar }) => (
          <Columns selected={file} centre={centre} facts={facts} factsLabel="Settings" bar={bar} newKind={newKind} setNewKind={setNewKind} />
        )}
      />
    );
  }
  return (
    <Columns
      selected={file}
      centre={
        detail.data === undefined ? (
          <Empty error={detail.isError}>{detail.isError ? detail.error.message : "Loading…"}</Empty>
        ) : (
          <Centre key={fileKey(file)} file={file} detail={detail.data} />
        )
      }
      facts={detail.data !== undefined && <Facts detail={detail.data} />}
      newKind={newKind}
      setNewKind={setNewKind}
    />
  );
}
