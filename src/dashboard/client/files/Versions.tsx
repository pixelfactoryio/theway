/**
 * Versions mode of the Workflows page: the right column's list of a file's saved versions, and one version drawn with
 * the file's own view and its diff to the current file.
 */
import { cn } from "cn";
import { Link, useLocation } from "wouter";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { type FileRef, fileHref, useVersion, useVersions, versionsHref } from "@/lib/api";
import type { FileDetail, PromptResolved, WorkflowResolved } from "../../types";
import { Diff } from "./Diff";
import { PromptView } from "./PromptView";
import { WorkflowView } from "./WorkflowView";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** An ISO time in local time: `Today, HH:MM` for today, else `D MMM, HH:MM`, on a 24-hour clock. */
export function whenOf(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const today = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return today ? `Today, ${time}` : `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
}

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

/** The right column: Current, each version newest first, then As shipped when the home holds it; `id` is the one selected, `null` for Current. */
export function VersionList({ file, id }: { file: FileRef; id: string | null }) {
  const versions = useVersions(file);
  return (
    <nav aria-label="Versions" className="flex flex-col gap-px">
      <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Versions</div>
      <VersionItem href={versionsHref(file)} selected={id === null} label="Current" note="current" />
      {versions.data === undefined ? (
        <Empty error={versions.isError}>{versions.isError ? versions.error.message : "Loading…"}</Empty>
      ) : (
        <>
          {versions.data.versions.map((v) => (
            <VersionItem key={v.id} href={versionsHref(file, v.id)} selected={id === v.id} label={whenOf(v.at)} />
          ))}
          {versions.data.shipped && <VersionItem href={versionsHref(file, "shipped")} selected={id === "shipped"} label="As shipped" />}
        </>
      )}
    </nav>
  );
}

/** The centre in versions mode with a version selected: its title row with Close, its drawing, and its diff to the current file. */
export function VersionView({ file, id, detail }: { file: FileRef; id: string; detail: FileDetail }) {
  const version = useVersion(file, id);
  const [, navigate] = useLocation();
  const versions = useVersions(file);
  if (version.data === undefined) return <Empty error={version.isError}>{version.isError ? version.error.message : "Loading…"}</Empty>;
  const { text, resolved } = version.data;
  const at = versions.data?.versions.find((v) => v.id === id)?.at;
  const subtitle = id === "shipped" ? "As shipped" : `Version of ${at === undefined ? id : whenOf(at)}`;
  const same = text === detail.text;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 py-4 pl-6">
        <div className="min-w-0">
          <h1 className="font-mono text-[20px] font-medium break-all">{file.name}</h1>
          <span className="text-muted-foreground">{subtitle}</span>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => navigate(fileHref(file))}>
            Close
          </Button>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center gap-3 p-6">
        {file.kind === "workflows" ? (
          <WorkflowView file={file} resolved={resolved as WorkflowResolved} text={text} />
        ) : (
          <PromptView resolved={resolved as PromptResolved} />
        )}
        <div className="flex w-full flex-col gap-1">
          <span className="text-[12px] text-muted-foreground">This version → current file</span>
          {same ? <span>Same as the current file.</span> : <Diff from={text} to={detail.text} />}
        </div>
      </div>
    </>
  );
}
