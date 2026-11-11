/**
 * Versions mode of the Workflows page: the right column's list of a file's saved versions, and one version drawn with
 * the file's own view, its diff to the current file, and Restore.
 */
import { useQueries } from "@tanstack/react-query";
import { cn } from "cn";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { editHref, type FileRef, fileHref, fileKey, useFile, useVersion, useVersions, versionQuery, versionsHref } from "@/lib/api";
import type { FileDetail, PromptResolved, WorkflowResolved } from "../../types";
import { Diff } from "./Diff";
import { isDirty } from "./draft";
import { useDrafts } from "./drafts";
import { Confirm } from "./fields";
import { PromptView } from "./PromptView";
import { TitleRow } from "./TitleRow";
import { deltaText, lineDelta, whenOf } from "./version-info";
import { WorkflowView } from "./WorkflowView";

/** An item of the list, styled like the file list's. */
function VersionItem({ href, selected, label, note }: { href: string; selected: boolean; label: string; note?: string }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={cn("flex items-baseline justify-between gap-2 rounded-md px-2.5 py-1.5", selected ? "bg-primary/10 text-primary" : "hover:bg-accent")}
    >
      <span className="truncate">{label}</span>
      {note !== undefined && <span className="shrink-0 text-[12px] text-muted-foreground">{note}</span>}
    </Link>
  );
}

/**
 * The right column: Current, each version newest first, then As shipped when the home holds it; `id` is the one
 * selected, `null` for Current. Current and each version say how many lines they add and remove against the version
 * before them.
 */
export function VersionList({ file, id }: { file: FileRef; id: string | null }) {
  const versions = useVersions(file);
  const current = useFile(file);
  const texts = useQueries({ queries: (versions.data?.versions ?? []).map((v) => versionQuery(file, v.id)) }).map((q) => q.data?.text);
  /** The delta of the text at `i` (`-1` for Current) against the version before it; `undefined` while either loads or for the oldest. */
  const delta = (i: number): string | undefined => {
    const to = i === -1 ? current.data?.text : texts[i];
    const from = texts[i + 1];
    return to === undefined || from === undefined ? undefined : deltaText(lineDelta(from, to));
  };
  return (
    <nav aria-label="Versions" className="flex flex-col gap-px">
      <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Versions</div>
      <VersionItem href={versionsHref(file)} selected={id === null} label="Current" note={delta(-1) ?? "current"} />
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
 * The centre in versions mode with a version selected: its title row with Close and Restore, its drawing, and its
 * diff to the current file. Restore makes the version's text the draft, byte for byte, and opens the editor; it asks
 * first when the file has unsaved changes.
 */
export function VersionView({ file, id, detail }: { file: FileRef; id: string; detail: FileDetail }) {
  const version = useVersion(file, id);
  const [, navigate] = useLocation();
  const versions = useVersions(file);
  const { drafts, start, edit } = useDrafts();
  const [confirming, setConfirming] = useState(false);
  if (version.data === undefined) return <Empty error={version.isError}>{version.isError ? version.error.message : "Loading…"}</Empty>;
  const { text, resolved } = version.data;
  const at = versions.data?.versions.find((v) => v.id === id)?.at;
  const subtitle = id === "shipped" ? "As shipped" : `Version of ${at === undefined ? id : whenOf(at)}`;
  const same = text === detail.text;
  const draft = drafts.get(fileKey(file))?.draft;
  const restore = () => {
    start(file, detail.text, detail.sha256, false);
    edit(file, text);
    navigate(editHref(file));
  };
  return (
    <>
      <TitleRow
        title={<h1 className="font-mono text-[20px] font-medium break-all">{file.name}</h1>}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(fileHref(file))}>
              Close
            </Button>
            <Button disabled={same} onClick={() => (draft !== undefined && isDirty(draft) ? setConfirming(true) : restore())}>
              Restore
            </Button>
          </>
        }
      >
        <span className="text-muted-foreground">{subtitle}</span>
      </TitleRow>
      <Tabs defaultValue="changes" className="flex-1 gap-3 pb-6 lg:px-6">
        <TabsList>
          <TabsTrigger value="changes" className="px-3">
            Changes
          </TabsTrigger>
          <TabsTrigger value="drawing" className="px-3">
            Content
          </TabsTrigger>
        </TabsList>
        <TabsContent value="changes" className="flex flex-col gap-1">
          <span className="text-[12px] text-muted-foreground">This version → current file</span>
          {same ? <span>Same as the current file.</span> : <Diff from={text} to={detail.text} className="max-h-none" />}
        </TabsContent>
        <TabsContent value="drawing" className="flex flex-col items-center gap-3">
          {file.kind === "workflows" ? (
            <WorkflowView file={file} resolved={resolved as WorkflowResolved} text={text} />
          ) : (
            <PromptView resolved={resolved as PromptResolved} />
          )}
        </TabsContent>
      </Tabs>
      <Confirm open={confirming} title={`Replace your unsaved changes to ${file.name}?`} action="Replace" onConfirm={restore} onClose={() => setConfirming(false)} />
    </>
  );
}
