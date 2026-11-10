/**
 * Edit mode's right column: a workflow's Workflow and Inputs panels, or the panels of its selected step; a prompt's
 * Header and Inputs panels, or "Use as a step". Every field is applied on change, as one operation on the draft.
 */
import { ArrowDown, ArrowUp, Braces, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { Document } from "yaml";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MODELS, PARAM, RUNS_ON, WORKFLOW_INPUT_TYPES } from "../../../core/language-schema";
import {
  addInput,
  defaultOnFail,
  HEADER_ORDER,
  moveStep,
  type OnFail,
  removeInput,
  removeStep,
  renameInput,
  setInputField,
  setStepField,
  setStepMatrix,
  setStepOnFail,
  setStepPrompt,
  setStepTries,
  setStepWith,
  setWorkflowField,
  WORKFLOW_ORDER,
} from "../editor/ops";
import { setHeaderField } from "../editor/prompt";
import type { PromptContext } from "./context";
import { Check, Choice, Input, Row, TextField } from "./fields";
import type { HeaderSource, InputSource, OnFailSource, StepSource, WorkflowSource } from "./source";
import { Panel } from "./WorkflowView";

/** Applies an operation to the draft's Document: the workflow's, or the prompt header's. */
export type Apply = (op: (doc: Document) => void) => void;

/** The value of a select that stands for "not written". */
const UNSET = "";

/** The label of a model select's UNSET: the prompt's model, `Prompt's (<model>)`, or `Prompt's` when its header sets none. */
const promptModel = (ctx: PromptContext, name: string | null): string => {
  const model = ctx.info(name)?.header?.model ?? null;
  return model === null ? "Prompt's" : `Prompt's (${model})`;
};

/** The names of a prompt's declared inputs, `null` while its header is not known. */
const declaredOf = (ctx: PromptContext, name: string | null): string[] | null => {
  const header = ctx.info(name)?.header;
  return header === undefined || header === null ? null : Object.keys(header.inputs);
};

/** A text field with a menu that inserts a reference at its end. */
function RefField({ value, refs, onChange }: { value: string; refs: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      <TextField value={value} mono onChange={onChange} />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" aria-label="Insert a reference" disabled={refs.length === 0}>
              <Braces />
            </Button>
          }
        />
        <DropdownMenuContent className="w-fit">
          {refs.map((r) => (
            <DropdownMenuItem key={r} className="font-mono text-[12px]" onClick={() => onChange(`${value}${r}`)}>
              {r}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** One field per input `prompt` declares, labelled with its name and description; `set` writes one, `""` for empty. */
function PromptInputs({
  ctx,
  name,
  values,
  refs,
  set,
}: {
  ctx: PromptContext;
  name: string | null;
  values: Record<string, string>;
  refs: string[];
  set: (input: string, value: string, required: boolean) => void;
}) {
  const header = ctx.info(name)?.header ?? null;
  const inputs = Object.entries(header?.inputs ?? {});
  if (header === null) return <span className="text-muted-foreground">{name === null ? "no prompt" : "Loading…"}</span>;
  if (inputs.length === 0) return <span className="text-muted-foreground">no input</span>;
  return (
    <>
      {inputs.map(([input, decl]) => (
        <Row
          key={input}
          group
          label={
            <span className="font-mono text-[13px]">
              {input}
              {decl.required && <span className="font-sans text-[12px] font-normal text-muted-foreground"> · required</span>}
            </span>
          }
          note={decl.description}
        >
          <RefField value={values[input] ?? ""} refs={refs} onChange={(v) => set(input, v, decl.required)} />
        </Row>
      ))}
    </>
  );
}

/** A number field that writes any integer typed and keeps what is typed otherwise. */
function TriesField({ value, onChange }: { value: string; onChange: (n: number) => void }) {
  const [typed, setTyped] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (typed !== value) setTyped(value);
  }
  return (
    <Input
      type="number"
      className="w-24"
      value={typed}
      onChange={(e) => {
        setTyped(e.target.value);
        if (/^-?\d+$/.test(e.target.value.trim())) onChange(Number(e.target.value));
      }}
    />
  );
}

/**
 * The Inputs panel: Add at its top right, then for each input its name, description, type (a workflow's), required and
 * default, and Remove; under a prompt's input, how its text writes it.
 */
function InputsPanel({ inputs, workflow, apply }: { inputs: InputSource[]; workflow: boolean; apply: Apply }) {
  const names = inputs.map((i) => i.name);
  return (
    <Panel
      title="Inputs"
      action={
        <Button variant="outline" size="xs" onClick={() => apply((d) => void addInput(d, workflow ? WORKFLOW_ORDER : HEADER_ORDER))}>
          <Plus /> Add
        </Button>
      }
    >
      {inputs.length === 0 && <span className="text-muted-foreground">no input</span>}
      {inputs.map((input, i) => (
        // By position, so a rename keeps the focus in its field.
        <div key={i} className="flex flex-col gap-2 border-b border-divider-row pb-3 last:border-b-0 last:pb-0">
          <Row label="Name">
            <TextField
              value={input.name}
              mono
              invalid={false}
              same={(typed, v) => typed === v || !PARAM.test(typed) || (names.includes(typed) && typed !== input.name)}
              onChange={(v) => {
                if (PARAM.test(v) && !names.includes(v)) apply((d) => renameInput(d, input.name, v));
              }}
            />
          </Row>
          <Row label="Description">
            <TextField value={input.description} onChange={(v) => apply((d) => setInputField(d, input.name, "description", v))} />
          </Row>
          {workflow && (
            <Row label="Type">
              <Choice
                value={input.type}
                options={WORKFLOW_INPUT_TYPES}
                onChange={(v) => apply((d) => setInputField(d, input.name, "type", v === "text" ? undefined : v))}
              />
            </Row>
          )}
          <Check
            checked={input.required}
            onChange={(on) =>
              apply((d) => {
                setInputField(d, input.name, "required", on ? true : undefined);
                if (on) setInputField(d, input.name, "default", undefined);
              })
            }
          >
            Required
          </Check>
          {!input.required && (
            <Row label="Default">
              <TextField value={input.default ?? ""} onChange={(v) => apply((d) => setInputField(d, input.name, "default", v === "" ? undefined : v))} />
            </Row>
          )}
          <Button variant="ghost" size="sm" className="self-start text-destructive" onClick={() => apply((d) => removeInput(d, input.name))}>
            <Trash2 /> Remove
          </Button>
          {!workflow && (
            <span className="text-[12px] text-muted-foreground">
              Written in the text as <span className="font-mono">{`\${{ inputs.${input.name} }}`}</span>
            </span>
          )}
        </div>
      ))}
    </Panel>
  );
}

/** The on-fail as the operations write it, from the source; `null` when its value names no prompt. */
const onFailOf = (o: OnFailSource): OnFail | null => (o.name === null ? null : { name: o.name, with: Object.entries(o.with), model: o.model });

/** The panels of the selected step: Step N, Inputs of its prompt, Matrix, On fail, then Runs on and Model. */
function StepPanels({
  source,
  index,
  ctx,
  apply,
  select,
  tiedLines,
}: {
  source: WorkflowSource;
  index: number;
  ctx: PromptContext;
  apply: Apply;
  select: (i: number | null) => void;
  tiedLines: string[];
}) {
  const step = source.steps[index] as StepSource;
  const count = source.steps.length;
  const promptNames = ctx.steps.map((p) => p.item.name);
  const options = step.name === null || promptNames.includes(step.name) ? promptNames : [step.name, ...promptNames];
  const inputRefs = source.inputs.map((i) => `\${{ inputs.${i.name} }}`);
  const refs = step.matrix === null ? inputRefs : [...inputRefs, `\${{ matrix.${step.matrix.key} }}`];
  const fallback = defaultOnFail(ctx.choices);
  const onFail = step.onFail === null ? null : onFailOf(step.onFail);
  const move = (to: number) => {
    apply((d) => moveStep(d, index, to));
    select(to);
  };
  const writeOnFail = (next: OnFail) => apply((d) => setStepOnFail(d, index, next));
  return (
    <>
      <Panel title={`Step ${index + 1}`}>
        <Row label="Prompt">
          <Choice
            value={step.name ?? ""}
            options={options}
            onChange={(name) => apply((d) => setStepPrompt(d, index, name, declaredOf(ctx, name) ?? Object.keys(step.with)))}
          />
        </Row>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" disabled={index === 0} onClick={() => move(index - 1)}>
            <ArrowUp /> Move up
          </Button>
          <Button variant="outline" size="sm" disabled={index === count - 1} onClick={() => move(index + 1)}>
            <ArrowDown /> Move down
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              apply((d) => removeStep(d, index));
              select(null);
            }}
          >
            <Trash2 /> Remove
          </Button>
        </div>
        {tiedLines.map((l) => (
          <p key={l} className="text-[12px] break-words text-destructive">
            {l}
          </p>
        ))}
      </Panel>
      <Panel title={`Inputs of ${step.name ?? step.uses}`}>
        <PromptInputs
          ctx={ctx}
          name={step.name}
          values={step.with}
          refs={refs}
          set={(input, v, required) => apply((d) => setStepWith(d, index, input, v === "" && !required ? undefined : v))}
        />
      </Panel>
      <Panel title="Matrix">
        <Check
          checked={step.matrix !== null}
          onChange={(on) => apply((d) => setStepMatrix(d, index, on ? { key: "item", values: ["value"] } : undefined))}
        >
          Run copies at once
        </Check>
        {step.matrix !== null && (
          <>
            <Row label="Key">
              <TextField
                value={step.matrix.key}
                mono
                same={(typed, v) => typed === v || !PARAM.test(typed)}
                onChange={(key) => {
                  if (PARAM.test(key) && step.matrix !== null) apply((d) => setStepMatrix(d, index, { key, values: step.matrix?.values ?? [] }));
                }}
              />
            </Row>
            <Row label="Values" note="One per line">
              <TextField
                value={step.matrix.values.join("\n")}
                multiline
                mono
                same={(typed, v) => lines(typed).join("\n") === v}
                onChange={(t) => apply((d) => setStepMatrix(d, index, { key: step.matrix?.key ?? "item", values: lines(t) }))}
              />
            </Row>
          </>
        )}
      </Panel>
      <Panel title="On fail">
        <Check
          checked={step.onFail !== null}
          disabled={step.onFail === null && fallback === null}
          onChange={(on) => {
            if (!on) apply((d) => setStepOnFail(d, index, undefined));
            else if (fallback !== null) apply((d) => setStepOnFail(d, index, fallback));
          }}
        >
          Run a prompt, then this step again
        </Check>
        {step.onFail !== null && (
          <>
            <Row label="Prompt">
              <Choice
                value={step.onFail.name ?? ""}
                options={step.onFail.name === null || promptNames.includes(step.onFail.name) ? promptNames : [step.onFail.name, ...promptNames]}
                onChange={(name) => {
                  const declared = declaredOf(ctx, name);
                  const kept = (onFail?.with ?? []).filter(([k]) => declared === null || declared.includes(k));
                  const required = Object.entries(ctx.info(name)?.header?.inputs ?? {}).flatMap(([k, i]) => (i.required && !kept.some(([w]) => w === k) ? [[k, ""] as [string, string]] : []));
                  writeOnFail({ name, with: [...kept, ...required], model: onFail?.model ?? null });
                }}
              />
            </Row>
            {onFail !== null && (
              <PromptInputs
                ctx={ctx}
                name={onFail.name}
                values={Object.fromEntries(onFail.with)}
                refs={inputRefs}
                set={(input, v, required) => {
                  const rest = onFail.with.filter(([k]) => k !== input);
                  const at = onFail.with.findIndex(([k]) => k === input);
                  const entry: [string, string][] = v === "" && !required ? [] : [[input, v]];
                  const next = at === -1 ? [...rest, ...entry] : [...rest.slice(0, at), ...entry, ...rest.slice(at)];
                  writeOnFail({ ...onFail, with: next });
                }}
              />
            )}
            {onFail !== null && (
              <Row label="Model">
                <Choice
                  value={onFail.model ?? UNSET}
                  options={[UNSET, ...MODELS]}
                  labels={{ [UNSET]: promptModel(ctx, onFail.name) }}
                  onChange={(m) => writeOnFail({ ...onFail, model: m === UNSET ? null : m })}
                />
              </Row>
            )}
            <Row label="Tries">
              <TriesField value={step.tries ?? ""} onChange={(n) => apply((d) => setStepTries(d, index, n))} />
            </Row>
          </>
        )}
      </Panel>
      {/* One field per line, so each select shows its value in full at the column's width. */}
      <Panel title="Runs on and model">
        <div className="flex flex-col gap-2">
          <Row label="Runs on">
            <Choice
              value={step.runsOn ?? UNSET}
              options={[UNSET, ...RUNS_ON]}
              labels={{ [UNSET]: "Workflow's", agents: "Agents", session: "Your session" }}
              onChange={(v) => apply((d) => setStepField(d, index, "runs-on", v === UNSET ? undefined : v))}
            />
          </Row>
          <Row label="Model">
            <Choice
              value={step.model ?? UNSET}
              options={[UNSET, ...MODELS]}
              labels={{ [UNSET]: promptModel(ctx, step.name) }}
              onChange={(v) => apply((d) => setStepField(d, index, "model", v === UNSET ? undefined : v))}
            />
          </Row>
        </div>
      </Panel>
    </>
  );
}

/** The non-empty lines of a text, trimmed. */
const lines = (t: string): string[] =>
  t
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");

/** A workflow's right column: its panels with nothing selected, or the selected step's. */
export function WorkflowSettings({
  source,
  selected,
  select,
  apply,
  ctx,
  tiedLines,
}: {
  source: WorkflowSource;
  selected: number | null;
  select: (i: number | null) => void;
  apply: Apply;
  ctx: PromptContext;
  tiedLines: string[];
}) {
  if (selected !== null && selected < source.steps.length) {
    return (
      <Column>
        <StepPanels key={selected} source={source} index={selected} ctx={ctx} apply={apply} select={select} tiedLines={tiedLines} />
      </Column>
    );
  }
  return (
    <Column>
      <Panel title="Workflow">
        <Row label="Description">
          <TextField value={source.description} multiline onChange={(v) => apply((d) => setWorkflowField(d, "description", v))} />
        </Row>
        <Check checked={source.default} onChange={(on) => apply((d) => setWorkflowField(d, "default", on ? true : undefined))}>
          Default workflow
        </Check>
        <Row label="Runs on">
          <Choice
            value={source.runsOn}
            options={RUNS_ON}
            labels={{ agents: "Agents", session: "Your session" }}
            onChange={(v) => apply((d) => setWorkflowField(d, "runs-on", v))}
          />
        </Row>
      </Panel>
      <InputsPanel inputs={source.inputs} workflow apply={apply} />
    </Column>
  );
}

/** A prompt's right column: its Header and Inputs panels, or "Use as a step" for a file with no header. */
export function PromptSettings({ header, apply, useAsStep }: { header: HeaderSource | { error: string } | null; apply: Apply; useAsStep: () => void }) {
  if (header !== null && "error" in header) {
    return (
      <Column>
        <Panel title="Header">
          <p className="text-[12px] break-words text-destructive">{header.error}</p>
        </Panel>
      </Column>
    );
  }
  if (header === null) {
    return (
      <Column>
        <Panel title="Header">
          <span className="text-muted-foreground">This file has no header: a workflow cannot run it as a step.</span>
          <Button variant="outline" className="self-start" onClick={useAsStep}>
            Use as a step
          </Button>
        </Panel>
      </Column>
    );
  }
  return (
    <Column>
      <Panel title="Header">
        <Row label="Description">
          <TextField value={header.description} multiline onChange={(v) => apply((d) => setHeaderField(d, "description", v))} />
        </Row>
        <Row label="Model">
          <Choice
            value={header.model ?? UNSET}
            options={[UNSET, ...MODELS]}
            labels={{ [UNSET]: "None" }}
            onChange={(v) => apply((d) => setHeaderField(d, "model", v === UNSET ? undefined : v))}
          />
        </Row>
      </Panel>
      <InputsPanel inputs={header.inputs} workflow={false} apply={apply} />
    </Column>
  );
}

/** The right column's stack of panels. */
function Column({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}
