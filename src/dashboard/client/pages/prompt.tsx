/**
 * A prompt's page, always editable: the title row with its status, Discard and Save; the Read tab (the body rendered)
 * and the Write tab (the body in a text box); and Details, as text on Read and as fields on Write. It works on the
 * file's draft, which its first edit starts.
 */
import { cn } from "cn";
import { Plus } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import type { Document } from "yaml";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { type Draft, isDirty, startDraft } from "@/files/draft";
import { takeOpenOnWrite, useDrafts, useUndoKeys } from "@/files/drafts";
import { useFileSave, useValidation } from "@/files/editing";
import { Check, Choice, Confirm, type FieldProblem, Problems, Row, TextField } from "@/files/fields";
import { type HeaderProblem, headerProblem, promptLine } from "@/files/problems";
import { type HeaderSource, headerSource } from "@/files/source";
import { type FileRef, fileHref, fileKey, useFile, useFiles, useVersions, versionsHref } from "@/lib/api";
import { plural } from "@/lib/changes";
import { appliesText, usageText } from "@/lib/prompts";
import { MODELS, PARAM } from "../../../core/language-schema";
import { renderMarkdown } from "../../markdown";
import type { FileDetail } from "../../types";
import { addInput, HEADER_ORDER, removeInput, renameInput, setInputField } from "../editor/ops";
import { addHeader, editableBody, editHeader, setEditableBody, setHeaderField } from "../editor/prompt";

/** The value of the model select that stands for "not written". */
const UNSET = "";

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

/** The body's text box: it keeps what is typed while the draft's body is that text, and shows the draft's otherwise, as on undo. */
function BodyField({ text, setBody }: { text: string; setBody: (body: string) => void }) {
  const body = editableBody(text);
  const [typed, setTyped] = useState(body);
  const [seen, setSeen] = useState(body);
  if (seen !== body) {
    setSeen(body);
    if (typed !== body) setTyped(body);
  }
  return (
    <Textarea
      aria-label="Body"
      className="min-h-[60vh] bg-card font-mono text-[13px] md:text-[13px]"
      value={typed}
      spellCheck={false}
      onChange={(e) => {
        setTyped(e.target.value);
        setBody(e.target.value);
      }}
    />
  );
}

/** The part of Details both tabs show as text: Used by, Applies to and History. */
function Reach({ file, detail, label }: { file: FileRef; detail: FileDetail | undefined; label: string | null }) {
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
              {usageText(u)}
            </Link>
          ))
        )}
      </Entry>
      <Entry label="Applies to">
        <span>{appliesText({ scope: file.scope, key: file.key, label }, detail?.overriddenBy ?? [], detail?.overrides ?? false)}</span>
      </Entry>
      <Entry label="History">
        <Link href={versionsHref(file)} className="font-medium text-primary hover:underline">
          {count === null ? "Versions" : plural(count, "version", "versions")}
        </Link>
      </Entry>
    </>
  );
}

/** Details on the Read tab: `model` and `inputs` of a header, as text. */
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

/** The ID of a header field's control, and the ID its problems are described by. */
const fieldId = (key: HeaderProblem["key"], input: string | null = null): string => `prompt-${key}${input === null ? "" : `-${input}`}`;

/** Details on the Write tab: `description`, `model` and `inputs` as fields, each with the problems tied to it. */
function HeaderFields({
  header,
  apply,
  problems,
}: {
  header: HeaderSource;
  apply: (op: (d: Document) => void) => void;
  problems: readonly HeaderProblem[];
}) {
  const at = (key: HeaderProblem["key"], input: string | null = null): FieldProblem => ({
    id: fieldId(key, input),
    messages: problems.filter((p) => p.key === key && p.input === input).map((p) => p.message),
  });
  const names = header.inputs.map((i) => i.name);
  return (
    <>
      <Row label={<Key>description</Key>} problem={at("description")}>
        <TextField value={header.description} problem={at("description")} onChange={(v) => apply((d) => setHeaderField(d, "description", v))} />
      </Row>
      <Row label={<Key>model</Key>} problem={at("model")}>
        <Choice
          value={header.model ?? UNSET}
          options={[UNSET, ...MODELS]}
          labels={{ [UNSET]: "None" }}
          problem={at("model")}
          onChange={(v) => apply((d) => setHeaderField(d, "model", v === UNSET ? undefined : v))}
        />
      </Row>
      <div role="group" aria-label="inputs" className="flex flex-col gap-2">
        <Key>inputs</Key>
        <Problems problem={at("inputs")} />
        {header.inputs.map((input, i) => (
          // By position, so a rename keeps the focus in its field.
          <div key={i} className="flex flex-col gap-2 border-l-2 border-divider pl-3">
            <Row label={<Key>name</Key>}>
              <TextField
                value={input.name}
                mono
                same={(typed, v) => typed === v || !PARAM.test(typed) || (names.includes(typed) && typed !== input.name)}
                onChange={(v) => {
                  if (PARAM.test(v) && !names.includes(v)) apply((d) => renameInput(d, input.name, v));
                }}
              />
            </Row>
            <Row label={<Key>description</Key>}>
              <TextField value={input.description} onChange={(v) => apply((d) => setInputField(d, input.name, "description", v))} />
            </Row>
            <div className="flex items-center justify-between gap-2">
              <Check
                checked={input.required}
                onChange={(on) =>
                  apply((d) => {
                    setInputField(d, input.name, "required", on ? true : undefined);
                    if (on) setInputField(d, input.name, "default", undefined);
                  })
                }
              >
                <Key>required</Key>
              </Check>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => apply((d) => removeInput(d, input.name))}>
                Remove
              </Button>
            </div>
            {!input.required && (
              <Row label={<Key>default</Key>}>
                <TextField value={input.default ?? ""} onChange={(v) => apply((d) => setInputField(d, input.name, "default", v === "" ? undefined : v))} />
              </Row>
            )}
            <Problems problem={at("inputs", input.name)} />
          </div>
        ))}
        <Button variant="ghost" size="sm" className="self-start text-primary" onClick={() => apply((d) => void addInput(d, HEADER_ORDER))}>
          <Plus /> Add an input
        </Button>
      </div>
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
  const { start, update, drop } = useDrafts();
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
  const labels = files.data?.projects.map((p) => p.label) ?? [];
  const label = file.key === null ? null : (files.data?.projects.find((p) => p.key === file.key)?.label ?? null);

  /** One edit of the draft: `fn` of its text; the first edit starts the draft from the saved text. */
  const change = (fn: (text: string) => string) => {
    if (!own) start(file, draft.text, draft.base, false);
    update(file, fn);
  };
  const apply = (op: (d: Document) => void) => change((t) => editHeader(t, op));

  // The lines to show: a refused save's for this text, else the last check's.
  const mine = refused !== null && refused.text === text;
  const errors = mine ? refused.errors : (validation.result?.errors ?? []);
  const warnings = mine ? refused.warnings : (validation.result?.warnings ?? []);
  const fields = header !== null && !("error" in header) ? header : null;
  /** The header problem of a line when the Write tab has a field for it. */
  const fielded = (line: string): HeaderProblem | null => {
    if (fields === null) return null;
    const p = headerProblem(line, file.name, labels);
    if (p === null || (p.key === "inputs" && p.input !== null && !fields.inputs.some((i) => i.name === p.input))) return null;
    return p;
  };
  const tied = tab === "write" ? errors.flatMap((l) => fielded(l) ?? []) : [];
  const loose = (tab === "write" ? errors.filter((l) => fielded(l) === null) : errors).map((l) => promptLine(l, file.name, labels));

  const discard = () => {
    drop(file);
    if (draft.isNew) navigate("/prompts");
  };
  const status = draft.isNew ? "New file" : dirty ? "Unsaved changes" : saving ? "Saving…" : "Saved";

  const details = (
    <>
      {header !== null && "error" in header && <p className="text-[12px] break-words text-destructive">{header.error}</p>}
      {fields !== null && (tab === "write" ? <HeaderFields header={fields} apply={apply} problems={tied} /> : <HeaderText header={fields} />)}
      {header === null && tab === "write" && (
        <Button variant="outline" className="self-start" onClick={() => change(addHeader)}>
          Use as a step
        </Button>
      )}
      <Reach file={file} detail={detail} label={label} />
    </>
  );

  return (
    <main id="content" tabIndex={-1} className="flex w-full max-w-[1200px] flex-col gap-3 px-4 py-6 outline-none lg:px-8 lg:py-8">
      <Link href="/prompts" className="self-start text-[12px] font-medium text-primary hover:underline">
        Prompts ›
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-auto min-w-0 text-[28px] font-semibold break-all">{file.name}</h1>
        <span role="status" className="text-[13px] text-muted-foreground">
          {status}
        </span>
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
          <TabsList variant="line" className="w-full justify-start border-b border-divider">
            <TabsTrigger value="read" className="flex-none px-1">
              Read
            </TabsTrigger>
            <TabsTrigger value="write" className="flex-none px-1">
              Write
            </TabsTrigger>
          </TabsList>
          <TabsContent value="read">
            {/* Rendered with raw HTML escaped; the CSP is the second layer. */}
            <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
          </TabsContent>
          <TabsContent value="write">
            <BodyField text={text} setBody={(body) => change((t) => setEditableBody(t, body))} />
          </TabsContent>
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
