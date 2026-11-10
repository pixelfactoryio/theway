import { cn } from "cn";
import { type ReactNode, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { HeaderErrors, PromptBadges, PromptView, UsedBy } from "@/files/PromptView";
import { VersionList, VersionView } from "@/files/Versions";
import { Panel, WorkflowPanels, WorkflowView } from "@/files/WorkflowView";
import { type FileRef, fileHref, fileKey, useFile, useFiles, versionsHref } from "@/lib/api";
import type { FileDetail, FileItem } from "../../types";

const sameFile = (a: FileRef, b: FileRef): boolean => a.scope === b.scope && a.key === b.key && a.kind === b.kind && a.name === b.name;

/** An item of the list: its name, then the `default` badge, its error mark, or the project it belongs to. */
function Item({ item, selected }: { item: FileItem; selected: boolean }) {
  const error = item.kind === "workflows" ? item.error : null;
  return (
    <Link
      href={fileHref(item)}
      aria-current={selected ? "page" : undefined}
      className={cn("flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5", selected ? "bg-primary/10 text-primary" : "hover:bg-accent")}
    >
      <span className="truncate font-mono text-[13px]">{item.name}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {item.scope === "project" && <span className="text-[12px] text-muted-foreground">{item.label ?? item.key} only</span>}
        {error !== null ? (
          <span className="text-[12px] text-destructive" title={error}>
            error
          </span>
        ) : (
          item.kind === "workflows" && item.default && <Badge variant="outline">default</Badge>
        )}
      </span>
    </Link>
  );
}

/** A group of the list: its heading in small capitals with its count on the right, then its items. */
function Group({ heading, items, selected, first }: { heading: string; items: FileItem[]; selected: FileRef | null; first: boolean }) {
  return (
    <>
      <div className={cn("flex items-baseline justify-between px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase", first ? "" : "pt-4")}>
        <span>{heading}</span>
        <span className="tabular-nums">{items.length}</span>
      </div>
      {items.map((item) => (
        <Item key={fileKey(item)} item={item} selected={selected !== null && sameFile(item, selected)} />
      ))}
    </>
  );
}

/** The file list: the workflows, the step prompts, then the other prompt files, in the response's order. */
function FileList({ selected }: { selected: FileRef | null }) {
  const files = useFiles();
  if (files.data === undefined) return <Empty error={files.isError}>{files.isError ? files.error.message : "Loading…"}</Empty>;
  const { workflows, prompts } = files.data;
  return (
    <nav aria-label="Files" className="flex flex-col gap-px">
      <Group heading="Workflows" items={workflows} selected={selected} first />
      <Group heading="Prompts" items={prompts.filter((p) => p.step)} selected={selected} first={false} />
      <Group heading="Reference files" items={prompts.filter((p) => !p.step)} selected={selected} first={false} />
    </nav>
  );
}

/** The File panel: the file's path, and what overrides it or what it overrides. */
function FilePanel({ detail }: { detail: FileDetail }) {
  return (
    <Panel title="File">
      <span className="font-mono text-[12px] break-all">{detail.path}</span>
      {detail.scope === "global" ? (
        detail.overriddenBy.length > 0 && (
          <span className="text-[12px] text-muted-foreground">overridden in {detail.overriddenBy.map((p) => p.label).join(", ")}</span>
        )
      ) : (
        <span className="text-[12px] text-muted-foreground">
          {detail.label ?? detail.key} only{detail.overrides && ` · replaces the global ${detail.name}`}
        </span>
      )}
    </Panel>
  );
}

/** The right column of a file: a workflow's Runs on, Inputs and File panels; a prompt's Used by and File panels. */
function Facts({ detail }: { detail: FileDetail }) {
  return (
    <div className="flex flex-col gap-3">
      {detail.kind === "workflows" ? "doc" in detail.resolved && <WorkflowPanels doc={detail.resolved.doc} /> : <UsedBy usedBy={detail.usedBy} />}
      <FilePanel detail={detail} />
    </div>
  );
}

/** The centre: the title row with its badges, Versions and the source toggle, then the drawing or the file's text. */
function Centre({ file, detail }: { file: FileRef; detail: FileDetail }) {
  const [source, setSource] = useState(false);
  const [, navigate] = useLocation();
  return (
    <>
      <div className="flex flex-wrap items-start gap-3 py-4 pl-6">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-[20px] font-medium break-all">{file.name}</h1>
            {detail.kind === "prompts" && <PromptBadges step={detail.step} resolved={detail.resolved} />}
          </div>
          {detail.description !== null && <span className="text-muted-foreground">{detail.description}</span>}
          {detail.kind === "prompts" && <HeaderErrors resolved={detail.resolved} usedBy={detail.usedBy} />}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => navigate(versionsHref(file))}>
            Versions
          </Button>
          <Button variant="outline" aria-pressed={source} onClick={() => setSource(!source)}>
            {detail.kind === "workflows" ? "YAML" : "Markdown"}
          </Button>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center gap-3 px-6 pb-6">
        {source ? (
          <pre className="w-full overflow-x-auto rounded-lg border bg-card p-3 font-mono text-[13px]">{detail.text}</pre>
        ) : detail.kind === "workflows" ? (
          <WorkflowView file={file} resolved={detail.resolved} text={detail.text} />
        ) : (
          <PromptView resolved={detail.resolved} />
        )}
      </div>
    </>
  );
}

/** The three columns: the file list, the centre and the right column (`factsLabel`). */
function Columns({ selected, centre, facts, factsLabel = "Facts" }: { selected: FileRef | null; centre: ReactNode; facts: ReactNode; factsLabel?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-1 px-6">
      <aside aria-label="Files" className="w-[260px] shrink-0 border-r border-divider py-4 pr-4">
        <FileList selected={selected} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">{centre}</main>
      <aside aria-label={factsLabel} className="w-[280px] shrink-0 border-l border-divider py-4 pl-4">
        {facts}
      </aside>
    </div>
  );
}

/** `/workflows`: the first workflow of the list. */
export function WorkflowsIndex() {
  const files = useFiles();
  const first = files.data?.workflows[0];
  if (first !== undefined) return <Redirect to={fileHref(first)} replace />;
  return <Columns selected={null} centre={files.data !== undefined && <Empty>No workflows</Empty>} facts={null} />;
}

/** The mode of the Workflows page: the file's view, or its versions with one selected (`null` for Current). */
export type Mode = { view: true } | { version: string | null };

/** The Workflows page with one file selected, in view or versions mode. */
export function WorkflowsPage({ file, mode }: { file: FileRef; mode: Mode }) {
  const detail = useFile(file);
  const loading = detail.data === undefined ? <Empty error={detail.isError}>{detail.isError ? detail.error.message : "Loading…"}</Empty> : null;
  if ("version" in mode) {
    return (
      <Columns
        selected={file}
        centre={
          loading ??
          (mode.version === null ? (
            <Centre key={fileKey(file)} file={file} detail={detail.data as FileDetail} />
          ) : (
            <VersionView key={mode.version} file={file} id={mode.version} detail={detail.data as FileDetail} />
          ))
        }
        facts={<VersionList file={file} id={mode.version} />}
        factsLabel="Versions"
      />
    );
  }
  return (
    <Columns
      selected={file}
      centre={loading ?? <Centre key={fileKey(file)} file={file} detail={detail.data as FileDetail} />}
      facts={detail.data !== undefined && <Facts detail={detail.data} />}
    />
  );
}
