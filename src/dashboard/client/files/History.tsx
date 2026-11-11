/**
 * The History page of a workflow or a prompt: its versions in the right column, the diff from the selected one to the
 * current file or its whole text in the centre, and Restore this version.
 */
import { useQueries, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { editHref, type FileRef, fileHref, fileKey, useFile, useVersions, versionQuery, versionsHref } from "@/lib/api";
import { Diff } from "./Diff";
import { isDirty } from "./draft";
import { openOnWrite, useDrafts } from "./drafts";
import { Confirm } from "./fields";
import { deltaText, lineDelta, whenOf } from "./version-info";

/** An item of the list: its label, and its note on the right. */
function VersionItem({ href, selected, label, note }: { href: string; selected: boolean; label: string; note?: string }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={cn("flex items-baseline justify-between gap-2 rounded-md px-2.5 py-2", selected ? "bg-primary/10 text-primary" : "hover:bg-accent")}
    >
      <span className="truncate">{label}</span>
      {note !== undefined && <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">{note}</span>}
    </Link>
  );
}

/**
 * The Versions list: Current, each kept version newest first, then As shipped when the home holds it; `id` is the one
 * selected, `null` for Current. Current and each version say how many lines they add and remove against the version
 * before them.
 */
function VersionList({ file, id, current }: { file: FileRef; id: string | null; current: string | undefined }) {
  const versions = useVersions(file);
  const texts = useQueries({ queries: (versions.data?.versions ?? []).map((v) => versionQuery(file, v.id)) }).map((q) => q.data?.text);
  /** The delta of the text at `i` (`-1` for Current) against the version before it; `undefined` while either loads or for the oldest. */
  const delta = (i: number): string | undefined => {
    const to = i === -1 ? current : texts[i];
    const from = texts[i + 1];
    return to === undefined || from === undefined ? undefined : deltaText(lineDelta(from, to));
  };
  return (
    <nav aria-label="Versions" className="flex flex-col gap-px">
      <h2 className="px-2.5 pb-2 font-semibold">Versions</h2>
      <VersionItem href={versionsHref(file)} selected={id === null} label="Current" note={delta(-1)} />
      {versions.data === undefined ? (
        <Empty error={versions.isError}>{versions.isError ? versions.error.message : "Loading…"}</Empty>
      ) : (
        <>
          {versions.data.versions.map((v, i) => (
            <VersionItem key={v.id} href={versionsHref(file, v.id)} selected={id === v.id} label={whenOf(v.at)} note={delta(i)} />
          ))}
          {versions.data.shipped && <VersionItem href={versionsHref(file, "shipped")} selected={id === "shipped"} label="As shipped" />}
        </>
      )}
    </nav>
  );
}

/**
 * The History page of `file` with the version `id` selected (`null` for Current, `shipped` for As shipped). Restore
 * this version makes the version's text the draft, byte for byte, as one undoable edit, then opens the file's page (a
 * prompt's on its Write tab, a workflow's edit mode); it asks first when the file has unsaved changes, and is disabled
 * when the version holds the current text.
 */
export function History({ file, id }: { file: FileRef; id: string | null }) {
  const [, navigate] = useLocation();
  const current = useFile(file);
  const version = useQuery({ ...versionQuery(file, id ?? ""), enabled: id !== null });
  const { drafts, start, edit } = useDrafts();
  const [whole, setWhole] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const detail = current.data;
  const text = id === null ? detail?.text : version.data?.text;
  const same = detail !== undefined && text === detail.text;
  const draft = drafts.get(fileKey(file))?.draft;
  const restore = () => {
    if (detail === undefined || text === undefined) return;
    start(file, detail.text, detail.sha256, false);
    edit(file, text);
    if (file.kind === "prompts") {
      openOnWrite(file);
      navigate(fileHref(file));
    } else navigate(editHref(file));
  };
  const failed = current.isError ? current.error : version.isError ? version.error : null;
  return (
    <main id="content" tabIndex={-1} className="flex min-h-dvh flex-1 flex-col outline-none">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-divider px-4 py-3 lg:px-6">
        <Button variant="ghost" size="icon" aria-label={`Back to ${file.name}`} onClick={() => navigate(fileHref(file))}>
          <ArrowLeft />
        </Button>
        <h1 className="min-w-0 text-[18px] font-semibold break-all">{file.name}</h1>
        <span className="mr-auto text-muted-foreground">History</span>
        <Tabs value={whole ? "whole" : "changes"} onValueChange={(v) => setWhole(v === "whole")}>
          <TabsList>
            <TabsTrigger value="changes" className="px-3">
              Changes
            </TabsTrigger>
            <TabsTrigger value="whole" className="px-3">
              Whole file
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" disabled={id === null || text === undefined || same} onClick={() => (draft !== undefined && isDirty(draft) ? setConfirming(true) : restore())}>
          Restore this version
        </Button>
      </div>
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="min-w-0 flex-1 p-4 lg:p-6">
          {failed !== null ? (
            <Empty error>{failed.message}</Empty>
          ) : detail === undefined || text === undefined ? (
            <Empty>Loading…</Empty>
          ) : id === null || whole ? (
            <pre className="overflow-x-auto rounded-lg border bg-card p-3 font-mono text-[13px]">{text}</pre>
          ) : same ? (
            <p>Same as the current file.</p>
          ) : (
            <Diff from={text} to={detail.text} className="max-h-none" />
          )}
        </div>
        <aside aria-label="Versions" className="border-t border-divider p-4 lg:w-[280px] lg:shrink-0 lg:border-t-0 lg:border-l">
          <VersionList file={file} id={id} current={detail?.text} />
        </aside>
      </div>
      <Confirm open={confirming} title={`Replace your unsaved changes to ${file.name}?`} action="Replace" onConfirm={restore} onClose={() => setConfirming(false)} />
    </main>
  );
}
