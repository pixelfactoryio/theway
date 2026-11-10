/** The New dialog: a workflow or a prompt, empty or copied from another, for all projects or one; nothing is written until Save. */
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { editHref, type FileRef, fileKey, useFile, useFiles } from "@/lib/api";
import { NAME } from "../../../core/language-schema";
import { EXT, type FileItem, type FilesResponse, type SourceKind } from "../../types";
import { usePromptContext } from "./context";
import { useDrafts } from "./drafts";
import { Choice, Input, Row } from "./fields";
import { copyText, newPromptText, newWorkflowText } from "./new-file";

/** The "Where" value of the global scope, and the "Start from" value of an empty file. */
const ALL = "\u0000all";
const EMPTY = "\u0000empty";

/** Why `target` cannot be a new file; `""` when it can. */
function refusal(target: FileRef, files: FilesResponse, drafts: ReadonlyMap<string, unknown>): string {
  if (!NAME.test(target.name)) return "lowercase letters and digits, in words separated by single hyphens";
  const exists = [...files.workflows, ...files.prompts].some((f) => fileKey(f) === fileKey(target)) || drafts.has(fileKey(target));
  return exists ? "a file of that name exists there" : "";
}

/** The dialog's form, mounted while it is open. */
function NewForm({ initial, files, onClose }: { initial: SourceKind; files: FilesResponse; onClose: () => void }) {
  const { drafts, start } = useDrafts();
  const [, navigate] = useLocation();
  const [kind, setKind] = useState<SourceKind>(initial);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [from, setFrom] = useState(EMPTY);
  const [scope, setScope] = useState(ALL);
  const [tried, setTried] = useState(false);
  const items: FileItem[] = kind === "workflows" ? files.workflows : files.prompts;
  const source = items.find((f) => fileKey(f) === from);
  const target: FileRef = scope === ALL ? { scope: "global", key: null, kind, name } : { scope: "project", key: scope, kind, name };
  const reason = refusal(target, files, drafts);
  const copied = useFile(source ?? { scope: "global", key: null, kind, name: "" }, source !== undefined);
  const ctx = usePromptContext(target);
  const loading = source !== undefined ? copied.data === undefined : kind === "workflows" && ctx.steps.some((p) => p.header === null);
  const ready = description.trim() !== "" && !loading;
  const create = () => {
    setTried(true);
    if (reason !== "" || !ready) return;
    const text =
      source !== undefined && copied.data !== undefined
        ? copyText(kind, copied.data.text, description)
        : kind === "workflows"
          ? newWorkflowText(description, ctx.choices)
          : newPromptText(description);
    start(target, text, null, true);
    onClose();
    navigate(editHref(target));
  };
  const label = (f: FileItem) => `A copy of ${f.scope === "global" ? f.name : `${f.name} (${f.label ?? f.key ?? ""})`}`;
  return (
    <>
      <DialogHeader>
        <DialogTitle>New</DialogTitle>
        <DialogDescription>Opens in the editor as a draft. Nothing is written until you save.</DialogDescription>
      </DialogHeader>
      <Row label="What" group>
        <Tabs
          value={kind}
          onValueChange={(v) => {
            setKind(v as SourceKind);
            setFrom(EMPTY);
          }}
        >
          <TabsList>
            <TabsTrigger value="workflows" className="px-3">
              Workflow
            </TabsTrigger>
            <TabsTrigger value="prompts" className="px-3">
              Prompt
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </Row>
      <Row
        label="Name"
        note={
          tried && reason !== "" ? (
            <span className="text-destructive">{reason}</span>
          ) : (
            <>
              Saved as <span className="font-mono break-all">{`${kind}/${name === "" ? "<name>" : name}${EXT[kind]}`}</span>
            </>
          )
        }
      >
        <Input className="font-mono text-[13px]" value={name} aria-invalid={(tried && reason !== "") || undefined} onChange={(e) => setName(e.target.value)} />
      </Row>
      <Row label="Description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Row>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Start from">
          <Choice
            value={from}
            options={[EMPTY, ...items.map(fileKey)]}
            labels={{ [EMPTY]: "Empty", ...Object.fromEntries(items.map((f) => [fileKey(f), label(f)])) }}
            onChange={(v) => {
              setFrom(v);
              const d = items.find((f) => fileKey(f) === v)?.description;
              if (d !== undefined && d !== null && description === "") setDescription(d);
            }}
          />
        </Row>
        <Row label="Where">
          <Choice
            value={scope}
            options={[ALL, ...files.projects.map((p) => p.key)]}
            labels={{ [ALL]: "All projects", ...Object.fromEntries(files.projects.map((p) => [p.key, p.label])) }}
            onChange={setScope}
          />
        </Row>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={create} disabled={!ready}>
          Create
        </Button>
      </DialogFooter>
    </>
  );
}

/** The New dialog, open while `kind` is set, on that kind. */
export function NewDialog({ kind, onClose }: { kind: SourceKind | null; onClose: () => void }) {
  const files = useFiles();
  return (
    <Dialog open={kind !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        {kind !== null && files.data !== undefined && <NewForm initial={kind} files={files.data} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
