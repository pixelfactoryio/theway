/** The New dialog: a workflow or a step made as a copy of an existing one, for all projects or for one; nothing is written until Save. */
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { absoluteOf, editHref, type FileRef, fileKey, useFile } from "@/lib/api";
import { NAME } from "../../../core/schema";
import type { FileItem, FilesResponse } from "../../types";
import { useDrafts } from "./drafts";
import { Choice, Input, Row } from "./fields";
import { newFileText } from "./new-file";

const ALL = "\u0000";
const itemKey = (f: FileRef): string => fileKey(f);

/** Why `name` cannot be a new file of `kind` at `scope`/`key`; `""` when it can. */
function refusal(name: string, target: FileRef, files: FilesResponse, drafts: ReadonlyMap<string, unknown>): string {
  if (!NAME.test(name)) return "lowercase letters and digits, in words separated by single hyphens";
  if (target.kind === "steps" && name === "gate") return "gate is reserved for the gate entry";
  const exists = [...files.workflows, ...files.steps].some((f) => fileKey(f) === fileKey(target)) || drafts.has(fileKey(target));
  return exists ? "a file of that name exists there" : "";
}

/** The dialog's form, mounted while it is open. */
function NewForm({ kind, files, open: current, onClose }: { kind: "workflows" | "steps"; files: FilesResponse; open: FileRef | null; onClose: () => void }) {
  const { drafts, start } = useDrafts();
  const [, navigate] = useLocation();
  const items: FileItem[] = kind === "workflows" ? files.workflows : files.steps;
  const first = (current !== null && current.kind === kind ? items.find((f) => fileKey(f) === fileKey(current)) : undefined) ?? items[0];
  const [from, setFrom] = useState(first === undefined ? "" : itemKey(first));
  const source = items.find((f) => itemKey(f) === from);
  const [name, setName] = useState("");
  const [description, setDescription] = useState(source?.description ?? "");
  const [scope, setScope] = useState(ALL);
  const [tried, setTried] = useState(false);
  const target: FileRef = scope === ALL ? { scope: "global", key: null, kind, name } : { scope: "project", key: scope, kind, name };
  const reason = refusal(name, target, files, drafts);
  const copied = useFile(source ?? { scope: "global", key: null, kind, name: "" }, source !== undefined);
  const ready = source !== undefined && copied.data !== undefined && (kind === "workflows" || description.trim() !== "");
  const create = () => {
    setTried(true);
    if (reason !== "" || !ready || copied.data === undefined) return;
    start(target, newFileText(kind, copied.data.text, description), null, true);
    onClose();
    navigate(editHref(target));
  };
  const label = (f: FileItem) => (f.scope === "global" ? f.name : `${f.name} (${f.label ?? f.key ?? ""})`);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{kind === "workflows" ? "New workflow" : "New step"}</DialogTitle>
      </DialogHeader>
      <Row label="Name" note={tried && reason !== "" ? <span className="text-destructive">{reason}</span> : undefined}>
        <Input className="font-mono text-[13px]" value={name} aria-invalid={(tried && reason !== "") || undefined} onChange={(e) => setName(e.target.value)} />
      </Row>
      <Row label="Description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Row>
      <Row label="Copy from">
        <Choice
          value={from}
          options={items.map(itemKey)}
          labels={Object.fromEntries(items.map((f) => [itemKey(f), label(f)]))}
          onChange={(v) => {
            setFrom(v);
            setDescription(items.find((f) => itemKey(f) === v)?.description ?? "");
          }}
        />
      </Row>
      <Row label="For" note={<span className="font-mono break-all">{absoluteOf(files, { ...target, name: name === "" ? "<name>" : name })}</span>}>
        <Choice
          value={scope}
          options={[ALL, ...files.projects.map((p) => p.key)]}
          labels={{ [ALL]: "all projects", ...Object.fromEntries(files.projects.map((p) => [p.key, `${p.label} only`])) }}
          onChange={setScope}
        />
      </Row>
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

/** The New dialog of `kind`, open while `kind` is set; `open` is the file the page shows. */
export function NewDialog({ kind, files, open, onClose }: { kind: "workflows" | "steps" | null; files: FilesResponse | undefined; open: FileRef | null; onClose: () => void }) {
  return (
    <Dialog open={kind !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[400px] sm:max-w-[400px]">{kind !== null && files !== undefined && <NewForm kind={kind} files={files} open={open} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}
