import { cn } from "cn";
import { type ReactNode, useState } from "react";
import { Link, Redirect } from "wouter";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { StepView } from "@/files/StepView";
import { WorkflowView } from "@/files/WorkflowView";
import { type FileRef, fileHref, useFile, useFiles } from "@/lib/api";
import type { FileDetail, FileItem } from "../../types";

const sameFile = (a: FileRef, b: FileRef): boolean => a.scope === b.scope && a.key === b.key && a.kind === b.kind && a.name === b.name;

/** The note on an item's right: `default`, `<label> only` and ` · default`; `null` for none. */
function itemNote(item: FileItem): string | null {
  if (item.scope === "global") return item.default ? "default" : null;
  return `${item.label ?? item.key ?? ""} only${item.default ? " · default" : ""}`;
}

function Item({ item, selected }: { item: FileItem; selected: boolean }) {
  const note = itemNote(item);
  return (
    <Link
      href={fileHref(item)}
      aria-current={selected ? "page" : undefined}
      className={cn("flex items-baseline justify-between gap-2 rounded-md px-2.5 py-1.5", selected ? "bg-accent" : "hover:bg-accent")}
    >
      <span className="truncate font-mono text-[13px]">{item.name}</span>
      {item.error !== null ? (
        <span className="shrink-0 text-[12px] text-destructive" title={item.error}>
          error
        </span>
      ) : (
        note !== null && <span className="shrink-0 text-[12px] text-muted-foreground">{note}</span>
      )}
    </Link>
  );
}

/** The file list: the workflows, then the steps, in the response's order. */
function FileList({ selected }: { selected: FileRef | null }) {
  const files = useFiles();
  if (files.data === undefined) return <Empty error={files.isError}>{files.isError ? files.error.message : "Loading…"}</Empty>;
  const group = (heading: string, items: FileItem[], first: boolean) => (
    <>
      <div className={cn("px-2.5 pb-1 text-[12px] text-muted-foreground", first ? "" : "pt-3.5")}>{heading}</div>
      {items.map((item) => (
        <Item key={`${item.scope}/${item.key ?? ""}/${item.kind}/${item.name}`} item={item} selected={selected !== null && sameFile(item, selected)} />
      ))}
    </>
  );
  return (
    <nav aria-label="Files" className="flex flex-col gap-px">
      {group("Workflows", files.data.workflows, true)}
      {group("Steps", files.data.steps, false)}
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

/** The centre: the title row with the YAML switch, then the drawing or the file's text. */
function Centre({ file, detail }: { file: FileRef; detail: FileDetail }) {
  const [yaml, setYaml] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 py-4 pl-6">
        <div className="min-w-0">
          <h1 className="font-mono text-[20px] font-medium break-all">{file.name}</h1>
          {detail.description !== null && <span className="text-muted-foreground">{detail.description}</span>}
        </div>
        <Button variant="outline" className="ml-auto" aria-pressed={yaml} onClick={() => setYaml(!yaml)}>
          YAML
        </Button>
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

/** The three columns: the file list, the centre and the facts. */
function Columns({ selected, centre, facts }: { selected: FileRef | null; centre: ReactNode; facts: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-1 px-6">
      <aside aria-label="Files" className="w-[280px] shrink-0 border-r border-divider py-4 pr-4">
        <FileList selected={selected} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">{centre}</main>
      <aside aria-label="Facts" className="w-[280px] shrink-0 border-l border-divider py-4 pl-4">
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

/** The Workflows page with one file selected. */
export function WorkflowsPage({ file }: { file: FileRef }) {
  const detail = useFile(file);
  const key = `${file.scope}/${file.key ?? ""}/${file.kind}/${file.name}`;
  return (
    <Columns
      selected={file}
      centre={
        detail.data === undefined ? (
          <Empty error={detail.isError}>{detail.isError ? detail.error.message : "Loading…"}</Empty>
        ) : (
          <Centre key={key} file={file} detail={detail.data} />
        )
      }
      facts={detail.data !== undefined && <Facts detail={detail.data} />}
    />
  );
}
