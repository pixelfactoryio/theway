/** The editor's inspector: the form of the selected element, every change applied as one edit operation. */
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { type Document, isNode } from "yaml";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ACCESS, EXHAUSTED, INPUTS, MODELS, PARAM, type ParamValue, type StepItem, TYPES } from "../../../core/schema";
import type { AnyNode, StepNode } from "../graph/model";
import { Choice, Conditions, type ConfirmAsk, condsOf, maxOf, namesOf, Row } from "./dialogs";
import {
  moveEntry,
  type Path,
  removeEntry,
  removeNode,
  setDescription,
  setEntryAgents,
  setEntryParam,
  setGate,
  setNodeField,
  setParam,
  setWorkflowField,
} from "./ops";

/** An edit: an operation on the document of a file, by key. */
export type Edit = (file: string, op: (doc: Document) => void) => void;

/** The JS value at a YAML path of a document. */
function rawAt(doc: Document | undefined, path: Path): unknown {
  if (doc === undefined) return undefined;
  const n = path.length === 0 ? doc.contents : doc.getIn(path, true);
  return isNode(n) ? n.toJSON() : n;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === null ? [] : [String(v)]);
const shown = (v: unknown): string => (v === undefined || v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v));

/** A text field that applies its value on blur or Enter, once it changed. */
function TextField({
  id,
  value,
  placeholder,
  multiline = false,
  onCommit,
}: {
  id?: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  if (multiline) {
    return <Textarea id={id} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />;
  }
  return (
    <Input
      id={id}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

/** A param value typed as text, parsed as the kind of its default: an integer, a boolean, a comma list or a string. */
export function typed(text: string, like: unknown): ParamValue {
  const t = text.trim();
  if (t.startsWith("${")) return t;
  if (typeof like === "number" && /^-?[0-9]+$/.test(t)) return Number(t);
  if (typeof like === "boolean" && (t === "true" || t === "false")) return t === "true";
  if (Array.isArray(like)) return namesOf(t) as string[];
  return text;
}

const KINDS = ["string", "integer", "boolean", "list"] as const;

/** A default typed by its kind. */
function defaultOf(kind: string, text: string): ParamValue | null {
  const t = text.trim();
  if (kind === "integer") return /^-?[0-9]+$/.test(t) ? Number(t) : null;
  if (kind === "boolean") return t === "true" || t === "false" ? t === "true" : null;
  if (kind === "list") {
    const names = namesOf(t);
    return Array.isArray(names) && names.length > 0 ? names : null;
  }
  return t === "" ? null : text;
}

/** The params table of an editable step header: each param removable, and a row to add one. */
function ParamsTable({ doc, file, edit }: { doc: Document | undefined; file: string; edit: Edit }) {
  const params = obj(rawAt(doc, ["params"]));
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("string");
  const [value, setValue] = useState("");
  const [description, setDesc] = useState("");
  const def = defaultOf(kind, value);
  const ok = PARAM.test(name) && name !== "agents" && name !== "item" && !(name in params) && def !== null && description.trim() !== "";
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-left text-[12px]">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-2 font-normal">Name</th>
            <th className="py-1 pr-2 font-normal">Default</th>
            <th className="py-1 font-normal">Description</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Object.entries(params).map(([p, d]) => (
            <tr key={p} className="border-t align-top">
              <td className="py-1 pr-2 font-mono">{p}</td>
              <td className="py-1 pr-2 font-mono">{shown(obj(d).default)}</td>
              <td className="py-1">{shown(obj(d).description)}</td>
              <td>
                <Button variant="ghost" size="icon-xs" aria-label={`Remove ${p}`} onClick={() => edit(file, (doc) => setParam(doc, p, undefined))}>
                  <X />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" aria-label="New param name" />
        <Choice value={kind} options={KINDS} onChange={setKind} />
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "list" ? "a, b" : "default"} aria-label="New param default" />
        <Input value={description} onChange={(e) => setDesc(e.target.value)} placeholder="description" aria-label="New param description" />
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={!ok}
        onClick={() => {
          edit(file, (doc) => setParam(doc, name, { default: def as ParamValue, description: description.trim() }));
          setName("");
          setValue("");
          setDesc("");
        }}
      >
        Add param
      </Button>
    </div>
  );
}

/** The model choices of an agent: the models and every `${param}` of its step. */
const modelChoices = (doc: Document | undefined): string[] => [...MODELS, ...Object.keys(obj(rawAt(doc, ["params"]))).map((p) => `\${${p}}`)];

export type InspectorProps = {
  node: AnyNode;
  /** The workflow's file key. */
  workflow: string;
  /** The open documents, by file key. */
  docs: Record<string, Document>;
  /** The number of workflow entries. */
  entries: number;
  steps: StepItem[];
  prompts: string[];
  edit: Edit;
  confirm: (ask: ConfirmAsk) => void;
  onClose: () => void;
  /** The Revert to global of a project step copy, when it has a global file. */
  revertStep?: (step: string) => void;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[11px] font-medium text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Move up, Move down and Remove of a workflow entry. */
function EntryActions({ index, p }: { index: number; p: InspectorProps }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button variant="outline" size="sm" disabled={index === 0} onClick={() => p.edit(p.workflow, (d) => moveEntry(d, index, index - 1))}>
        <ArrowUp /> Move up
      </Button>
      <Button variant="outline" size="sm" disabled={index >= p.entries - 1} onClick={() => p.edit(p.workflow, (d) => moveEntry(d, index, index + 1))}>
        <ArrowDown /> Move down
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          p.edit(p.workflow, (d) => removeEntry(d, index));
          p.onClose();
        }}
      >
        Remove
      </Button>
    </div>
  );
}

/** Delete of a construct, confirmed when it removes children. */
function DeleteNode({ file, path, count, p }: { file: string; path: Path; count: number; p: InspectorProps }) {
  const go = () => {
    p.edit(file, (d) => removeNode(d, path));
    p.onClose();
  };
  return (
    <Button
      variant="destructive"
      size="sm"
      className="self-start"
      onClick={() =>
        count === 0 ? go() : p.confirm({ title: "Delete with its children?", text: `This removes ${count} node(s) inside it too.`, action: "Delete", onConfirm: go })
      }
    >
      Delete
    </Button>
  );
}

function AgentForm({ file, path, p }: { file: string; path: Path; p: InspectorProps }) {
  const doc = p.docs[file];
  const fields = obj(obj(rawAt(doc, path)).agent);
  const prompts = list(fields.prompt);
  const step = file.slice("steps/".length);
  const setPrompts = (next: string[]) => p.edit(file, (d) => setNodeField(d, path, "prompt", next.length === 0 ? undefined : next.length === 1 ? next[0] : next));
  const move = (i: number, by: number) => {
    const next = [...prompts];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x as string);
    setPrompts(next);
  };
  return (
    <div className="flex flex-col gap-4">
      <Row label="Prompt">
        <div className="flex flex-wrap gap-1.5">
          {prompts.length === 0 && <span className="text-[12px] text-muted-foreground">{step}, the step's name</span>}
          {prompts.map((name, i) => (
            <Badge key={`${name}-${i}`} variant="secondary" className="h-auto gap-0.5 py-0.5 pr-0.5 font-mono">
              {name}
              <Button variant="ghost" size="icon-xs" aria-label={`Move ${name} left`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowLeft />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label={`Move ${name} right`} disabled={i === prompts.length - 1} onClick={() => move(i, 1)}>
                <ArrowRight />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label={`Remove ${name}`} onClick={() => setPrompts(prompts.filter((_, k) => k !== i))}>
                <X />
              </Button>
            </Badge>
          ))}
        </div>
        <Choice value="" options={p.prompts} onChange={(v) => v !== "" && setPrompts([...prompts, v])} none="Add a prompt" />
      </Row>
      <Row label="Returns">
        <Choice value={shown(fields.returns)} options={TYPES} onChange={(v) => p.edit(file, (d) => setNodeField(d, path, "returns", v))} />
      </Row>
      <Row label="Access">
        <Choice
          value={shown(fields.access)}
          options={ACCESS}
          none="default"
          onChange={(v) => p.edit(file, (d) => setNodeField(d, path, "access", v === "" ? undefined : v))}
        />
      </Row>
      <Row label="Model">
        <Choice
          value={shown(fields.model)}
          options={modelChoices(doc)}
          none="default"
          onChange={(v) => p.edit(file, (d) => setNodeField(d, path, "model", v === "" ? undefined : v))}
        />
      </Row>
      <DeleteNode file={file} path={path} count={0} p={p} />
    </div>
  );
}

function LoopForm({ file, path, count, p }: { file: string; path: Path; count: number; p: InspectorProps }) {
  const fields = obj(obj(rawAt(p.docs[file], path)).loop);
  return (
    <div className="flex flex-col gap-4">
      <Row label="Max" htmlFor="loop-max">
        <TextField id="loop-max" value={shown(fields.max)} placeholder="2 or ${rounds}" onCommit={(v) => p.edit(file, (d) => setNodeField(d, path, "max", maxOf(v)))} />
      </Row>
      <Row label="Until">
        <Conditions value={list(fields.until)} onChange={(v) => p.edit(file, (d) => setNodeField(d, path, "until", v.length === 0 ? undefined : condsOf(v)))} />
      </Row>
      <Row label="Exhausted">
        <Choice value={shown(fields.exhausted)} options={EXHAUSTED} onChange={(v) => p.edit(file, (d) => setNodeField(d, path, "exhausted", v))} />
      </Row>
      <DeleteNode file={file} path={path} count={count} p={p} />
    </div>
  );
}

function WhenForm({ file, path, count, p }: { file: string; path: Path; count: number; p: InspectorProps }) {
  const raw = obj(rawAt(p.docs[file], path));
  const mode = "fail" in raw ? "fail" : "block" in raw ? "block" : "do";
  const setMode = (next: string) => {
    if (next === mode) return;
    const go = () =>
      p.edit(file, (d) => {
        for (const k of ["do", "fail", "block"]) if (k !== next) setNodeField(d, path, k, undefined);
        setNodeField(d, path, next, next === "do" ? [] : true);
      });
    if (mode === "do" && count > 0) p.confirm({ title: "Remove its children?", text: `This removes ${count} node(s) under the when.`, action: "Remove", onConfirm: go });
    else go();
  };
  return (
    <div className="flex flex-col gap-4">
      <Row label="Conditions">
        <Conditions value={list(raw.when)} onChange={(v) => v.length > 0 && p.edit(file, (d) => setNodeField(d, path, "when", condsOf(v)))} />
      </Row>
      <Row label="Then">
        <Choice value={mode} options={["do", "fail", "block"]} onChange={setMode} />
      </Row>
      {mode === "block" && (
        <Row label="Block text" htmlFor="when-block">
          <TextField
            id="when-block"
            multiline
            value={raw.block === true ? "" : shown(raw.block)}
            placeholder="Empty blocks without a text"
            onCommit={(v) => p.edit(file, (d) => setNodeField(d, path, "block", v.trim() === "" ? true : v))}
          />
        </Row>
      )}
      <DeleteNode file={file} path={path} count={count} p={p} />
    </div>
  );
}

function ForeachForm({ file, path, count, p }: { file: string; path: Path; count: number; p: InspectorProps }) {
  const raw = obj(rawAt(p.docs[file], path));
  return (
    <div className="flex flex-col gap-4">
      <Row label="Value" htmlFor="foreach-value">
        <TextField id="foreach-value" value={shown(raw.foreach)} placeholder="${lenses} or a, b" onCommit={(v) => p.edit(file, (d) => setNodeField(d, path, "foreach", namesOf(v)))} />
      </Row>
      <label className="flex items-center gap-2">
        <Checkbox checked={raw.parallel === true} onCheckedChange={(on) => p.edit(file, (d) => setNodeField(d, path, "parallel", on === true ? true : undefined))} />
        Parallel
      </label>
      <DeleteNode file={file} path={path} count={count} p={p} />
    </div>
  );
}

/**
 * The params of a step as its open document declares them, edits included, each with its effective default from the
 * steps list when it is there (a config override applies), else its default in the document; the steps list alone
 * while the document is not loaded.
 */
function paramsOf(doc: Document | undefined, info: StepItem | undefined): { name: string; default: unknown; description: string }[] {
  const listed = info !== undefined && "params" in info ? info.params : [];
  if (doc === undefined) return listed;
  return Object.entries(obj(rawAt(doc, ["params"]))).map(([name, d]) => {
    const found = listed.find((l) => l.name === name);
    return { name, default: found !== undefined ? found.default : obj(d).default, description: shown(obj(d).description) };
  });
}

const MODES = { "": "default", true: "true", false: "false" } as const;
const modeOf = (v: string): boolean | undefined => (v === "" ? undefined : v === "true");

function StepForm({ node, p }: { node: StepNode; p: InspectorProps }) {
  const index = Number(node.src?.yaml[1] ?? 0);
  const entry = obj(obj(rawAt(p.docs[p.workflow], ["steps", index]))[node.step]);
  const file = node.file;
  const doc = p.docs[file];
  const declared = paramsOf(doc, p.steps.find((s) => s.name === node.step));
  return (
    <div className="flex flex-col gap-6">
      <Section title="Entry">
        <Row label="Agents">
          <Choice
            value={typeof entry.agents === "boolean" ? String(entry.agents) : ""}
            options={["true", "false"]}
            none={MODES[""]}
            onChange={(v) => p.edit(p.workflow, (d) => setEntryAgents(d, index, modeOf(v)))}
          />
        </Row>
        {declared.map((param) => (
          <Row key={param.name} label={param.name} htmlFor={`param-${param.name}`}>
            <TextField
              id={`param-${param.name}`}
              value={shown(entry[param.name])}
              placeholder={shown(param.default)}
              onCommit={(v) => p.edit(p.workflow, (d) => setEntryParam(d, index, param.name, v.trim() === "" ? undefined : typed(v, param.default)))}
            />
            <p className="text-[11px] text-muted-foreground">{param.description}</p>
          </Row>
        ))}
        <EntryActions index={index} p={p} />
      </Section>
      {node.editable && doc !== undefined && (
        <Section title={`Step file · ${node.step}`}>
          <Row label="Description" htmlFor="step-description">
            <TextField
              id="step-description"
              multiline
              value={shown(rawAt(doc, ["description"]))}
              onCommit={(v) => v.trim() !== "" && p.edit(file, (d) => setDescription(d, v.trim()))}
            />
          </Row>
          <Row label="Params">
            <ParamsTable doc={doc} file={file} edit={p.edit} />
          </Row>
          {node.origin === "project" && p.revertStep !== undefined && (
            <Button variant="ghost" size="sm" className="self-start" onClick={() => p.revertStep?.(node.step)}>
              Revert to global
            </Button>
          )}
        </Section>
      )}
      {!node.editable && node.error === undefined && <p className="text-[12px] text-muted-foreground">This step is global: use Edit for this project on its frame to change it.</p>}
    </div>
  );
}

function StartForm({ p }: { p: InspectorProps }) {
  const root = obj(rawAt(p.docs[p.workflow], []));
  return (
    <div className="flex flex-col gap-4">
      <Row label="Description" htmlFor="wf-description">
        <TextField
          id="wf-description"
          value={shown(root.description)}
          onCommit={(v) => p.edit(p.workflow, (d) => setWorkflowField(d, "description", v.trim() === "" ? undefined : v.trim()))}
        />
      </Row>
      <Row label="Input">
        <Choice value={shown(root.input)} options={INPUTS} none="changes (default)" onChange={(v) => p.edit(p.workflow, (d) => setWorkflowField(d, "input", v === "" ? undefined : v))} />
      </Row>
      <label className="flex items-center gap-2">
        <Checkbox checked={root.default === true} onCheckedChange={(on) => p.edit(p.workflow, (d) => setWorkflowField(d, "default", on === true ? true : undefined))} />
        Default workflow of the project
      </label>
      <Row label="Agents">
        <Choice
          value={typeof root.agents === "boolean" ? String(root.agents) : ""}
          options={["true", "false"]}
          none={MODES[""]}
          onChange={(v) => p.edit(p.workflow, (d) => setWorkflowField(d, "agents", modeOf(v)))}
        />
      </Row>
    </div>
  );
}

function GateForm({ index, question, p }: { index: number; question: string; p: InspectorProps }) {
  return (
    <div className="flex flex-col gap-4">
      <Row label="Question" htmlFor="gate-question">
        <TextField id="gate-question" value={question} onCommit={(v) => v.trim() !== "" && p.edit(p.workflow, (d) => setGate(d, index, v.trim()))} />
      </Row>
      <EntryActions index={index} p={p} />
    </div>
  );
}

const TITLE: Record<string, string> = {
  agent: "Agent",
  loop: "Loop",
  when: "When",
  stop: "When",
  foreach: "For each",
  step: "Step",
  gate: "Gate",
  start: "Start",
};

/** The form of the selected node; a node of a read-only step shows that it is read-only. */
function Body({ p }: { p: InspectorProps }) {
  const { node } = p;
  if (node.kind === "start") return <StartForm p={p} />;
  if (node.kind === "step") return <StepForm node={node} p={p} />;
  if (node.kind === "gate") return <GateForm index={Number(node.src?.yaml[1] ?? 0)} question={node.question} p={p} />;
  if (!("src" in node) || node.src === undefined) return null;
  const { file, yaml, editable } = node.src;
  if (!editable) return <p className="text-muted-foreground">This step is global: use Edit for this project on its frame to change it.</p>;
  const count = "children" in node ? node.children.length : 0;
  switch (node.kind) {
    case "agent":
      return <AgentForm key={node.path} file={file} path={yaml} p={p} />;
    case "loop":
      return <LoopForm key={node.path} file={file} path={yaml} count={count} p={p} />;
    case "when":
    case "stop":
      return <WhenForm key={node.path} file={file} path={yaml} count={count} p={p} />;
    case "foreach":
      return <ForeachForm key={node.path} file={file} path={yaml} count={count} p={p} />;
    default:
      return null;
  }
}

/** A 360px panel with the selected element's form; Esc or × closes it. */
export function EditInspector(p: InspectorProps) {
  const { onClose } = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const heading = p.node.kind === "step" || p.node.kind === "gate" ? p.node.id : p.node.kind === "agent" ? p.node.name : "";
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l bg-white" aria-label="Inspector">
      <div className="flex h-11 items-center gap-2 border-b px-4">
        <Badge variant="secondary">{TITLE[p.node.kind] ?? p.node.kind}</Badge>
        <span className="min-w-0 grow truncate font-medium">{heading}</span>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <ScrollArea className="min-h-0 grow">
        <div className="p-4">
          <Body p={p} />
        </div>
      </ScrollArea>
    </aside>
  );
}
