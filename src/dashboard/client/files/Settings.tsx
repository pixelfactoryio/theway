/** The settings column of edit mode: the fields of the selected entry, construct or param, or of the file. */
import { type ReactNode, useMemo, useState } from "react";
import { type Document, parseDocument } from "yaml";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fileHref, useFile } from "@/lib/api";
import { ACCESS, EXHAUSTED, INPUTS, MODELS, PARAM, type ParamValue, TYPES } from "../../../core/schema";
import type { FileItem } from "../../types";
import {
  moveEntry,
  type ParamDef,
  removeEntry,
  removeNode,
  setDescription,
  setEntryAgents,
  setEntryParam,
  setGate,
  setNodeField,
  setParam,
  setWorkflowField,
} from "../editor/ops";
import { DEFAULT_AGENT } from "./constructs";
import { Check, Choice, Conditions, Confirm, commaList, oneOrList, Row, TextField } from "./fields";
import type { Selection } from "./selection";
import { pathKey } from "./selection";
import { type EntrySource, type ParamNode, type StepNode, stepSource, type WorkflowSource } from "./source";
import { shown } from "./StepView";

/** An edit: an operation on the open file's document. */
export type Apply = (op: (doc: Document) => void) => void;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** A value as a field shows it: a list joined with ", ", none as empty. */
const fieldText = (v: unknown): string => (v === undefined || v === null ? "" : Array.isArray(v) ? v.map(String).join(", ") : String(v));

/** A param value typed in a field, written with the type of `like`: an integer, a boolean, a comma list or a string; empty is `undefined`. */
export function typedLike(text: string, like: unknown): ParamValue | undefined {
  const t = text.trim();
  if (t === "") return undefined;
  if (t.startsWith("${")) return t;
  if (typeof like === "number") return /^-?[0-9]+$/.test(t) ? Number(t) : text;
  if (typeof like === "boolean") return t === "true" || t === "false" ? t === "true" : text;
  if (Array.isArray(like)) return commaList(text);
  return text;
}

const Heading = ({ children }: { children: ReactNode }) => <div className="font-medium">{children}</div>;

/** The Move up, Move down and Remove buttons of an entry or a construct. */
function Actions({ up, down, remove }: { up?: (() => void) | null; down?: (() => void) | null; remove: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {up !== undefined && (
        <Button variant="outline" size="sm" disabled={up === null} onClick={up ?? undefined}>
          Move up
        </Button>
      )}
      {down !== undefined && (
        <Button variant="outline" size="sm" disabled={down === null} onClick={down ?? undefined}>
          Move down
        </Button>
      )}
      <Button variant="destructive" size="sm" onClick={remove}>
        Remove
      </Button>
    </div>
  );
}

/** A select whose "none" option removes the key: `none` is its label, every other option shown as itself. */
const NONE = "\u0000";
function Optional({ value, none, options, onChange }: { value: string | null; none: string; options: readonly string[]; onChange: (v: string | undefined) => void }) {
  return (
    <Choice
      value={value ?? NONE}
      options={[NONE, ...options]}
      labels={{ [NONE]: none }}
      onChange={(v) => onChange(v === NONE ? undefined : v)}
    />
  );
}

/** A boolean select: `not set`, `true`, `false`. */
function BoolSelect({ value, onChange }: { value: boolean | null; onChange: (v: boolean | undefined) => void }) {
  return <Optional value={value === null ? null : String(value)} none="not set" options={["true", "false"]} onChange={(v) => onChange(v === undefined ? undefined : v === "true")} />;
}

// ---- Workflow ----

function WorkflowFields({ doc, apply }: { doc: Document; apply: Apply }) {
  const root = obj(doc.toJS());
  return (
    <>
      <Heading>Workflow</Heading>
      <Row label="Description">
        <TextField value={fieldText(root.description)} onChange={(v) => apply((d) => setWorkflowField(d, "description", v === "" ? undefined : v))} />
      </Row>
      <Row label="Input">
        <Choice value={typeof root.input === "string" ? root.input : "changes"} options={INPUTS} onChange={(v) => apply((d) => setWorkflowField(d, "input", v))} />
      </Row>
      <Check checked={root.default === true} onChange={(on) => apply((d) => setWorkflowField(d, "default", on ? true : undefined))}>
        Default
      </Check>
      <Row label="Agents">
        <BoolSelect value={typeof root.agents === "boolean" ? root.agents : null} onChange={(v) => apply((d) => setWorkflowField(d, "agents", v))} />
      </Row>
    </>
  );
}

/** The step file a workflow entry names, from the usable steps. */
function EntryParams({ item, entry, apply }: { item: FileItem; entry: Extract<EntrySource, { kind: "step" }>; apply: Apply }) {
  const detail = useFile(item);
  const params = useMemo((): ParamNode[] => {
    if (detail.data === undefined) return [];
    const s = stepSource(parseDocument(detail.data.text));
    return "error" in s ? [] : s.params;
  }, [detail.data]);
  return (
    <>
      {params.map((p) => (
        <Row key={p.name} label={<span className="font-mono text-[13px]">{p.name}</span>} note={p.description}>
          <TextField
            value={fieldText(entry.params[p.name])}
            placeholder={shown(p.default)}
            same={(typed, v) => fieldText(typedLike(typed, p.default)) === v}
            onChange={(v) => apply((d) => setEntryParam(d, entry.index, p.name, typedLike(v, p.default)))}
          />
        </Row>
      ))}
    </>
  );
}

function EntryFields({
  entry,
  count,
  steps,
  apply,
  select,
}: {
  entry: EntrySource;
  count: number;
  steps: FileItem[];
  apply: Apply;
  select: (s: Selection) => void;
}) {
  const i = entry.index;
  const up = i > 0 ? () => (apply((d) => moveEntry(d, i, i - 1)), select({ entry: i - 1 })) : null;
  const down = i < count - 1 ? () => (apply((d) => moveEntry(d, i, i + 1)), select({ entry: i + 1 })) : null;
  const remove = () => {
    apply((d) => removeEntry(d, i));
    select(null);
  };
  if (entry.kind === "gate") {
    return (
      <>
        <Heading>Gate</Heading>
        <Row label="Question">
          <TextField multiline value={entry.question} onChange={(v) => apply((d) => setGate(d, i, v))} />
        </Row>
        <Actions up={up} down={down} remove={remove} />
      </>
    );
  }
  const item = steps.find((s) => s.name === entry.id);
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[13px] font-medium">{entry.id}</span>
        {item !== undefined && (
          <Link href={fileHref(item)} className="text-[12px] underline">
            Open step
          </Link>
        )}
      </div>
      <Row label={<span className="font-mono text-[13px]">agents</span>}>
        <BoolSelect value={entry.agents} onChange={(v) => apply((d) => setEntryAgents(d, i, v))} />
      </Row>
      {item !== undefined && <EntryParams key={`${item.scope}/${item.key ?? ""}/${item.name}`} item={item} entry={entry} apply={apply} />}
      <Actions up={up} down={down} remove={remove} />
    </>
  );
}

// ---- Step ----

/** The constructs of a tree, depth first. */
const flatten = (list: StepNode[]): StepNode[] => list.flatMap((n) => [n, ...("children" in n ? flatten(n.children) : [])]);

/** `max` as typed: an integer, else the text (a `${param}`). */
const maxOf = (text: string): number | string => (/^[0-9]+$/.test(text.trim()) ? Number(text.trim()) : text.trim());

/** Conditions as written: one as a scalar, several as a list. */
const conds = (list: string[]): string | string[] => (list.length === 1 ? (list[0] as string) : list);

/** A `foreach` value as typed: a `${param}`, else the comma-separated names. */
const foreachOf = (text: string): string | string[] => (text.trim().startsWith("${") ? text.trim() : commaList(text));

function NodeFields({ node, params, apply, select }: { node: StepNode; params: ParamNode[]; apply: Apply; select: (s: Selection) => void }) {
  const [asking, setAsking] = useState(false);
  const path = node.path;
  const set = (field: string, v: unknown) => apply((d) => setNodeField(d, path, field, v));
  const doRemove = () => {
    apply((d) => removeNode(d, path));
    select(null);
  };
  const hasChildren = "children" in node && node.children.length > 0;
  const remove = (
    <>
      <Actions remove={() => (hasChildren ? setAsking(true) : doRemove())} />
      <Confirm open={asking} title="Remove this construct and its children?" action="Remove" onConfirm={doRemove} onClose={() => setAsking(false)} />
    </>
  );
  switch (node.kind) {
    case "agent": {
      const models = [...params.map((p) => `\${${p.name}}`), ...MODELS];
      return (
        <>
          <Heading>Agent</Heading>
          <Row label="Prompts">
            <TextField
              mono
              value={node.prompts.join(", ")}
              same={(typed, v) => commaList(typed).join(", ") === v}
              onChange={(v) => set("prompt", oneOrList(commaList(v)))}
            />
          </Row>
          <Row label="Returns">
            <Choice value={node.returns} options={TYPES} onChange={(v) => set("returns", v)} />
          </Row>
          <Row label="Access">
            <Optional value={node.access} none="default" options={ACCESS} onChange={(v) => set("access", v)} />
          </Row>
          <Row label="Model">
            <Optional value={node.model} none="not set" options={models} onChange={(v) => set("model", v)} />
          </Row>
          {remove}
        </>
      );
    }
    case "loop":
      return (
        <>
          <Heading>Loop</Heading>
          <Row label="Max">
            <TextField mono value={node.max} same={(typed, v) => String(maxOf(typed)) === v} onChange={(v) => set("max", v.trim() === "" ? undefined : maxOf(v))} />
          </Row>
          <Row label="Until" group>
            <Conditions value={node.until} onChange={(v) => set("until", conds(v))} />
          </Row>
          <Row label="Exhausted">
            <Choice value={node.exhausted} options={EXHAUSTED} onChange={(v) => set("exhausted", v)} />
          </Row>
          {remove}
        </>
      );
    case "when":
    case "stop": {
      const then = node.kind === "when" ? "run steps" : node.stop;
      const switchTo = (v: string) =>
        apply((d) => {
          if (v === then) return;
          for (const f of ["do", "fail", "block"]) setNodeField(d, path, f, undefined);
          if (v === "fail") setNodeField(d, path, "fail", true);
          else if (v === "block") setNodeField(d, path, "block", true);
          else setNodeField(d, path, "do", [DEFAULT_AGENT]);
        });
      return (
        <>
          <Heading>When</Heading>
          <Row label="Conditions" group>
            <Conditions value={node.conditions} onChange={(v) => set("when", conds(v))} />
          </Row>
          <Row label="Then">
            <Choice value={then} options={["run steps", "fail", "block"]} onChange={switchTo} />
          </Row>
          {node.kind === "stop" && node.stop === "block" && (
            <Row label="Block text">
              <TextField value={node.text ?? ""} onChange={(v) => set("block", v === "" ? true : v)} />
            </Row>
          )}
          {remove}
        </>
      );
    }
    case "foreach":
      return (
        <>
          <Heading>For each</Heading>
          <Row label="Value">
            <TextField
              mono
              value={Array.isArray(node.value) ? node.value.join(", ") : node.value}
              same={(typed, v) => fieldText(foreachOf(typed)) === v}
              onChange={(v) => set("foreach", foreachOf(v))}
            />
          </Row>
          <Check checked={node.parallel} onChange={(on) => set("parallel", on ? true : undefined)}>
            Parallel
          </Check>
          {remove}
        </>
      );
  }
}

const KINDS = ["string", "integer", "boolean", "list"] as const;
type Kind = (typeof KINDS)[number];

const kindOf = (v: ParamNode["default"]): Kind => (typeof v === "number" ? "integer" : typeof v === "boolean" ? "boolean" : Array.isArray(v) ? "list" : "string");

/** A default typed as `kind`; `null` when the text is not one. */
function defaultAs(kind: Kind, text: string): ParamValue | null {
  const t = text.trim();
  if (kind === "integer") return /^-?[0-9]+$/.test(t) ? Number(t) : null;
  if (kind === "boolean") return t === "true" || t === "false" ? t === "true" : null;
  if (kind === "list") return commaList(text);
  return text;
}

function ParamFields({ param, params, apply, select }: { param: ParamNode; params: ParamNode[]; apply: Apply; select: (s: Selection) => void }) {
  const [kind, setKind] = useState<Kind>(kindOf(param.default));
  const [text, setText] = useState(shown(param.default));
  // The form stays mounted while its param is renamed, so the Name field keeps the focus. Another param, or a default
  // changed otherwise than by the typed text (undo, redo), resets the type and the text to the file's.
  const fileDefault = `${kindOf(param.default)}:${shown(param.default)}`;
  const [seen, setSeen] = useState({ name: param.name, fileDefault });
  const [renamedTo, setRenamedTo] = useState<string | null>(null);
  if (seen.name !== param.name || seen.fileDefault !== fileDefault) {
    const typed = defaultAs(kind, text);
    const other = seen.name !== param.name && param.name !== renamedTo;
    const matches = typed !== null && `${kindOf(typed)}:${shown(typed)}` === fileDefault;
    setSeen({ name: param.name, fileDefault });
    if (other || !matches) {
      setKind(kindOf(param.default));
      setText(shown(param.default));
    }
  }
  const def =(): ParamDef => ({ default: (param.default ?? "") as ParamValue, description: param.description ?? "" });
  const writeDefault = (k: Kind, t: string) => {
    const v = defaultAs(k, t);
    if (v !== null) apply((d) => setParam(d, param.name, { ...def(), default: v }));
  };
  return (
    <>
      <Heading>Param</Heading>
      <Row label="Name">
        <TextField
          mono
          value={param.name}
          onChange={(v) => {
            const name = v.trim();
            if (name === param.name || !PARAM.test(name) || params.some((p) => p.name === name)) return;
            apply((d) => {
              setParam(d, param.name, undefined);
              setParam(d, name, def());
            });
            setRenamedTo(name);
            select({ param: name });
          }}
        />
      </Row>
      <Row label="Default">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              mono
              value={shown(param.default)}
              invalid={defaultAs(kind, text) === null}
              same={(typed, v) => {
                const d = defaultAs(kind, typed);
                return d !== null && fieldText(d) === v;
              }}
              onChange={(v) => {
                setText(v);
                writeDefault(kind, v);
              }}
            />
          </div>
          <div className="w-28">
            <Select
              value={kind}
              onValueChange={(v) => {
                const k = (v ?? "string") as Kind;
                setKind(k);
                writeDefault(k, text);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Row>
      <Row label="Description">
        <TextField value={param.description ?? ""} onChange={(v) => apply((d) => setParam(d, param.name, { ...def(), description: v }))} />
      </Row>
      <Actions
        remove={() => {
          apply((d) => setParam(d, param.name, undefined));
          select(null);
        }}
      />
    </>
  );
}

/**
 * The settings column: the error lines tied to the selection, then its fields; with nothing selected, the file's.
 * `steps` are the steps a workflow entry may name.
 */
export function Settings({
  kind,
  doc,
  workflow,
  steps,
  selection,
  select,
  apply,
  tiedLines,
}: {
  kind: "workflows" | "steps";
  doc: Document;
  workflow: WorkflowSource | null;
  steps: FileItem[];
  selection: Selection;
  select: (s: Selection) => void;
  apply: Apply;
  tiedLines: string[];
}) {
  const step = useMemo(() => (kind === "steps" ? stepSource(doc) : null), [kind, doc]);
  let body: ReactNode = null;
  if (kind === "workflows" && workflow !== null && "error" in workflow) body = null;
  else if (kind === "workflows") {
    const entries = workflow !== null && "entries" in workflow ? workflow.entries : [];
    const entry = selection !== null && "entry" in selection ? entries.find((e) => e.index === selection.entry) : undefined;
    body =
      entry === undefined ? (
        <WorkflowFields doc={doc} apply={apply} />
      ) : (
        <EntryFields key={`${entry.index}:${entry.kind === "gate" ? "gate" : entry.id}`} entry={entry} count={entries.length} steps={steps} apply={apply} select={select} />
      );
  } else if (step !== null && !("error" in step)) {
    const node = selection !== null && "node" in selection ? flatten(step.nodes).find((n) => pathKey(n.path) === pathKey(selection.node)) : undefined;
    const param = selection !== null && "param" in selection ? step.params.find((p) => p.name === selection.param) : undefined;
    if (node !== undefined) body = <NodeFields key={`${pathKey(node.path)}:${node.kind}`} node={node} params={step.params} apply={apply} select={select} />;
    else if (param !== undefined) body = <ParamFields key="param"param={param} params={step.params} apply={apply} select={select} />;
    else
      body = (
        <>
          <Heading>Step</Heading>
          <Row label="Description">
            <TextField multiline value={step.description ?? ""} onChange={(v) => apply((d) => setDescription(d, v))} />
          </Row>
        </>
      );
  }
  return (
    <div className="flex flex-col gap-3.5">
      {tiedLines.length > 0 && (
        <div className="flex flex-col gap-1">
          {tiedLines.map((l) => (
            <span key={l} className="text-[12px] break-words text-destructive">
              {l}
            </span>
          ))}
        </div>
      )}
      {body}
    </div>
  );
}
