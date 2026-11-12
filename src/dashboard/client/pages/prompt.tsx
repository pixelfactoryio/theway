/**
 * A prompt's page, always editable: the title row with its status, Diff, Discard and Save; the Read tab (the body rendered)
 * and the Write tab (the whole file, header and body, in a code editor); and Details, as text on both tabs. It works on
 * the file's draft, which its first edit starts.
 */
import { cn } from "cn";
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeEditor } from "@/files/CodeEditor";
import { Diff } from "@/files/Diff";
import { type Draft, isDirty, startDraft } from "@/files/draft";
import { takeOpenOnWrite, useDrafts, useUndoKeys } from "@/files/drafts";
import { useFileSave, useValidation } from "@/files/editing";
import { Confirm } from "@/files/fields";
import { promptLine, withItemError } from "@/files/problems";
import { type HeaderSource, headerSource } from "@/files/source";
import { type FileRef, fileHref, fileKey, useFile, useFiles, useVersions, versionsHref } from "@/lib/api";
import { plural } from "@/lib/changes";
import { projectNames } from "@/lib/labels";
import { appliesText, usageText } from "@/lib/prompts";
import { renderMarkdown } from "../../markdown";
import type { FileDetail } from "../../types";
import { addHeader, editableBody } from "../editor/prompt";

/** A YAML key as a label: in monospace. */
const Key = ({ children }: { children: string }) => <span className="font-mono text-[13px]">{children}</span>;

/** A Details entry: its label, then its value. */
function Entry({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

/** A box of check lines: destructive for errors, warning for warnings. */
function Lines({ lines, tone }: { lines: string[]; tone: "error" | "warning" }) {
  if (lines.length === 0) return null;
  return (
    <ul
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border px-4 py-2.5 font-mono text-[12px] break-words",
        tone === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-warning/40 bg-warning/10",
      )}
    >
      {lines.map((l, i) => (
        <li key={`${i}:${l}`}>{l}</li>
      ))}
    </ul>
  );
}

/** The part of Details both tabs show as text: Used by, Applies to and History. */
function Reach({
  file,
  detail,
  label,
  names,
}: {
  file: FileRef;
  detail: FileDetail | undefined;
  label: string | null;
  names: ReadonlyMap<string, string>;
}) {
  const applies = { scope: file.scope, key: file.key, label };
  const versions = useVersions(file);
  const count = versions.data === undefined ? null : versions.data.versions.length + (versions.data.shipped ? 1 : 0);
  const uses = detail?.usedBy ?? [];
  return (
    <>
      <Entry label="Used by">
        {uses.length === 0 ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          uses.map((u) => (
            <Link
              key={`${u.scope}/${u.key ?? ""}/${u.name}/${u.use}/${u.step}`}
              href={fileHref({ scope: u.scope, key: u.key, kind: "workflows", name: u.name })}
              title={u.scope === "project" ? (u.label ?? u.key ?? undefined) : undefined}
              className="font-medium text-primary hover:underline"
            >
              {usageText(u, uses, names)}
            </Link>
          ))
        )}
      </Entry>
      <Entry label="Applies to">
        <span title={appliesText(applies, detail?.overriddenBy ?? [], detail?.overrides ?? false)}>
          {appliesText(applies, detail?.overriddenBy ?? [], detail?.overrides ?? false, names)}
        </span>
      </Entry>
      <Entry label="History">
        <Link href={versionsHref(file)} className="font-medium text-primary hover:underline">
          {count === null ? "Versions" : plural(count, "version", "versions")}
        </Link>
      </Entry>
    </>
  );
}

/** Details of a header: `model` and `inputs`, as text. */
function HeaderText({ header }: { header: HeaderSource }) {
  return (
    <>
      <Entry label={<Key>model</Key>}>
        <span className={header.model === null ? "text-muted-foreground" : "font-medium"}>{header.model ?? "–"}</span>
      </Entry>
      <Entry label={<Key>inputs</Key>}>
        {header.inputs.length === 0 ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          header.inputs.map((i) => (
            <div key={i.name} className="flex flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[13px] font-medium">{i.name}</span>
                {i.required && <Badge variant="secondary">required</Badge>}
              </span>
              {i.description !== "" && <span className="text-muted-foreground">{i.description}</span>}
              {i.default !== null && (
                <span className="text-[12px] text-muted-foreground">
                  <Key>default</Key>: {i.default}
                </span>
              )}
            </div>
          ))
        )}
      </Entry>
    </>
  );
}

/** The open tab of a prompt's page. */
type Tab = "read" | "write";

/**
 * The page of a prompt on `draft`: the file's draft, or, before its first edit, the saved text as one; `own` when the
 * store holds it.
 */
function Editor({
  file,
  draft,
  own,
  detail,
  tab,
  setTab,
}: {
  file: FileRef;
  draft: Draft;
  own: boolean;
  detail: FileDetail | undefined;
  tab: Tab;
  setTab: (tab: Tab) => void;
}) {
  const { start, update, drop, undo, redo } = useDrafts();
  const files = useFiles();
  const [, navigate] = useLocation();
  const [discarding, setDiscarding] = useState(false);
  useUndoKeys(file);
  const validation = useValidation(file, draft.text);
  const { save, saving, conflict, refused, reload, canSave } = useFileSave(file, draft);
  const text = draft.text;
  const header = useMemo(() => headerSource(text), [text]);
  const html = useMemo(() => renderMarkdown(editableBody(text)), [text]);
  const dirty = isDirty(draft);
  const main = useRef<HTMLElement>(null);
  // Diff shows the unsaved edits; it is unpressed once the draft is clean or dropped, and by a click on either tab.
  const canDiff = dirty && !draft.isNew;
  const [diffing, setDiffing] = useState(false);
  if (diffing && !canDiff) setDiffing(false);
  const showDiff = diffing && canDiff;
  // When the Diff button goes while it had the focus, the focus goes to the page rather than staying on the body.
  const hadDiff = useRef(canDiff);
  useLayoutEffect(() => {
    if (hadDiff.current && !canDiff && document.activeElement === document.body) main.current?.focus({ preventScroll: true });
    hadDiff.current = canDiff;
  }, [canDiff]);
  const labels = files.data?.projects.map((p) => p.label) ?? [];
  const label = file.key === null ? null : (files.data?.projects.find((p) => p.key === file.key)?.label ?? null);
  // The list item's error is about the saved text: it shows only while the page holds that text.
  const itemError =
    draft.isNew || dirty ? null : (files.data?.prompts.find((p) => p.scope === file.scope && p.key === file.key && p.name === file.name)?.error ?? null);

  /** One edit of the draft: `fn` of its text, `at` the time of a typed edit; the first edit starts the draft from the saved text. */
  const change = (fn: (text: string) => string, at?: number) => {
    if (!own) start(file, draft.text, draft.base, false);
    update(file, fn, at);
  };

  // The lines to show: a refused save's for this text, else the last check's.
  const mine = refused !== null && refused.text === text;
  const errors = withItemError(mine ? refused.errors : (validation.result?.errors ?? []), itemError, file.name, labels);
  const warnings = mine ? refused.warnings : (validation.result?.warnings ?? []);
  const fields = header !== null && !("error" in header) ? header : null;
  const loose = errors.map((l) => promptLine(l, file.name, labels));
  // A file whose header is opened and not closed has none, and gets no second one.
  const headless = header === null && text.split("\n")[0]?.replace(/\r$/, "") !== "---";

  const discard = () => {
    drop(file);
    if (draft.isNew) navigate("/prompts");
  };
  const status = draft.isNew ? "New file" : dirty ? "Unsaved changes" : "Saved";

  const details = (
    <>
      {header !== null && "error" in header && <p className="text-[12px] break-words text-destructive">{header.error}</p>}
      {fields !== null && <HeaderText header={fields} />}
      {headless && tab === "write" && (
        <Button variant="outline" className="self-start" onClick={() => change(addHeader)}>
          Use as a step
        </Button>
      )}
      <Reach file={file} detail={detail} label={label} names={projectNames(labels)} />
    </>
  );

  return (
    <main ref={main} id="content" tabIndex={-1} className="flex w-full max-w-[1200px] flex-col gap-3 px-4 py-6 outline-none lg:px-8 lg:py-8">
      <Link href="/prompts" className="self-start text-[12px] font-medium text-primary hover:underline">
        Prompts ›
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-auto min-w-0 text-[20px] font-semibold wrap-anywhere">{file.name}</h1>
        <span role="status" className="text-[13px] text-muted-foreground">
          {status}
        </span>
        {canDiff && (
          <Button variant="outline" aria-pressed={showDiff} onClick={() => setDiffing(!showDiff)}>
            {showDiff ? "Back to editing" : "Diff"}
          </Button>
        )}
        {dirty && (
          <Button variant="outline" disabled={saving} onClick={() => setDiscarding(true)}>
            Discard
          </Button>
        )}
        <Button disabled={!canSave} onClick={() => void save()}>
          Save
        </Button>
      </div>
      <Confirm
        open={discarding}
        title={`Discard your unsaved changes to ${file.name}?`}
        action="Discard"
        onConfirm={discard}
        onClose={() => setDiscarding(false)}
      />
      {fields !== null && fields.description !== "" && <p className="text-muted-foreground">{fields.description}</p>}
      {conflict && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5">
          <span className="mr-auto">Changed on disk since you opened it.</span>
          <Button size="sm" variant="outline" onClick={reload}>
            Reload
          </Button>
        </div>
      )}
      <Lines lines={loose} tone="error" />
      <Lines lines={warnings.map((l) => promptLine(l, file.name, labels))} tone="warning" />
      <div className="flex flex-col gap-6 pt-2 lg:flex-row lg:items-start">
        <Tabs value={tab} onValueChange={(v) => setTab(v === "write" ? "write" : "read")} className="min-w-0 flex-1 gap-4">
          <TabsList variant="line" className="w-full justify-start">
            <TabsTrigger value="read" onClick={() => setDiffing(false)}>
              Read
            </TabsTrigger>
            <TabsTrigger value="write" onClick={() => setDiffing(false)}>
              Write
            </TabsTrigger>
          </TabsList>
          {showDiff ? (
            <Diff from={draft.start} to={text} className="max-h-none" />
          ) : (
            <>
              <TabsContent value="read">
                {/* Rendered with raw HTML escaped; the CSP is the second layer. */}
                <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
              </TabsContent>
              <TabsContent value="write">
                <CodeEditor
                  value={text}
                  onChange={(t) => change(() => t, Date.now())}
                  onUndo={() => undo(file)}
                  onRedo={() => redo(file)}
                  language="prompt"
                  label={`prompts/${file.name}.md`}
                  className="min-h-[60vh]"
                />
              </TabsContent>
            </>
          )}
        </Tabs>
        <aside aria-label="Details" className="flex flex-col gap-4 lg:w-[280px] lg:shrink-0">
          <h2 className="border-b border-divider pb-3 font-semibold">Details</h2>
          {details}
        </aside>
      </div>
    </main>
  );
}

/**
 * A prompt's page: its draft when it has one, else its saved text; a new file has nothing on disk to read. It opens on
 * Read, or on Write after Create or Restore.
 */
export function PromptPage({ file }: { file: FileRef }) {
  const { drafts } = useDrafts();
  const draft = drafts.get(fileKey(file))?.draft;
  const detail = useFile(file, draft === undefined || !draft.isNew);
  const [tab, setTab] = useState<Tab>(() => (takeOpenOnWrite(file) || draft?.isNew === true ? "write" : "read"));
  const saved = detail.data;
  if (draft === undefined && saved === undefined) {
    return (
      <main id="content" tabIndex={-1} className="flex w-full flex-col outline-none">
        <Empty error={detail.isError}>{detail.isError ? detail.error.message : "Loading…"}</Empty>
      </main>
    );
  }
  const shown = draft ?? startDraft((saved as FileDetail).text, (saved as FileDetail).sha256, false);
  return <Editor file={file} draft={shown} own={draft !== undefined} detail={saved} tab={tab} setTab={setTab} />;
}
