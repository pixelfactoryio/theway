/**
 * The panel of a selected step: its Settings, each labelled with its YAML key and edited through one operation on the
 * draft, with the check's lines under the field they name; and its prompt's text, read-only.
 */
import { Braces, Plus, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { Document } from "yaml";
import { Link } from "wouter";
import { Empty } from "@/components/state";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fileHref, useFile } from "@/lib/api";
import { cardTitle, effectiveRunsOn } from "@/lib/workflows";
import { MODELS, PARAM, RUNS_ON } from "../../../core/language-schema";
import {
  type OnFail,
  prefillOnFail,
  removeStep,
  setStepField,
  setStepMatrix,
  setStepOnFail,
  setStepPrompt,
  setStepTries,
  setStepWith,
  usesOf,
} from "../editor/ops";
import type { PromptContext } from "./context";
import { StepTile } from "./Diagram";
import { type FieldProblem, Input, invalidProps, Problems, Row, TextField, Choice } from "./fields";
import type { OnFailSource, StepSource, WorkflowSource } from "./source";

/** Applies an operation to the draft's workflow Document. */
export type Apply = (op: (doc: Document) => void) => void;

/** A YAML key as a label: in monospace. */
export const Key = ({ children }: { children: ReactNode }) => <span className="font-mono text-[13px]">{children}</span>;

/** The value of a select that stands for "not written". */
const UNSET = "\u0000unset";
/** The value of the on-fail select that stands for no on-fail. */
const NONE = "\u0000none";

/**
 * The options of a select over `choices`, with the value as written first, labelled `<value> · invalid`, when it is none
 * of them; `labels` names the others.
 */
export function withInvalid(value: string, choices: readonly string[], labels: Record<string, string>): { options: string[]; labels: Record<string, string> } {
  if (choices.includes(value)) return { options: [...choices], labels };
  return { options: [value, ...choices], labels: { ...labels, [value]: `${value} · invalid` } };
}

/** A step's error line under a field: its message after the `steps[i].<key>: ` part. */
export type StepError = { key: string | null; message: string };

/** The names of a prompt's required inputs, `[]` while its header is not known. */
const requiredOf = (ctx: PromptContext, name: string | null): string[] =>
  Object.entries(ctx.info(name)?.header?.inputs ?? {}).flatMap(([k, i]) => (i.required ? [k] : []));

/** The names of a prompt's declared inputs, `null` while its header is not known. */
const declaredOf = (ctx: PromptContext, name: string | null): string[] | null => {
  const header = ctx.info(name)?.header;
  return header === undefined || header === null ? null : Object.keys(header.inputs);
};

/** A text field with a menu that inserts a reference at its end. */
function RefField({ value, refs, onChange, problem, label }: { value: string; refs: string[]; onChange: (v: string) => void; problem?: FieldProblem; label: string }) {
  return (
    <div className="flex gap-1">
      <TextField value={value} mono onChange={onChange} problem={problem} label={label} />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" aria-label={`Insert a reference in ${label}`} disabled={refs.length === 0}>
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

/**
 * The `with` rows of a prompt: one per input its header declares (a `required` mark, the value, the insert menu), then
 * each written entry it does not declare with Remove; every written entry with Remove when the header is not known.
 */
function WithRows({
  ctx,
  name,
  values,
  refs,
  set,
  problem,
}: {
  ctx: PromptContext;
  name: string | null;
  values: Record<string, string>;
  refs: string[];
  /** Writes an input's value; `undefined` removes the entry. */
  set: (input: string, value: string | undefined) => void;
  problem: FieldProblem;
}) {
  const header = ctx.info(name)?.header ?? null;
  const declared = header === null ? [] : Object.entries(header.inputs);
  const extra = Object.keys(values).filter((k) => !declared.some(([d]) => d === k));
  if (declared.length === 0 && extra.length === 0) return <span className="text-muted-foreground">no input</span>;
  return (
    <div className="flex flex-col gap-2">
      {declared.map(([input, decl]) => (
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
          <RefField
            label={input}
            value={values[input] ?? ""}
            refs={refs}
            problem={{ ...problem, id: `${problem.id}-${input}`, messages: [] }}
            onChange={(v) => set(input, v === "" && !decl.required ? undefined : v)}
          />
        </Row>
      ))}
      {extra.map((input) => (
        <Row key={input} group label={<span className="font-mono text-[13px]">{input}</span>}>
          <div className="flex items-center gap-1">
            <RefField label={input} value={values[input] ?? ""} refs={refs} onChange={(v) => set(input, v)} />
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => set(input, undefined)}>
              Remove
            </Button>
          </div>
        </Row>
      ))}
    </div>
  );
}

/** A number field, 1 to 10 with no spinners: an integer typed is written, any other text stays in the field. */
function TriesField({ value, onChange, problem }: { value: string; onChange: (n: number) => void; problem: FieldProblem }) {
  const [typed, setTyped] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (typed !== value) setTyped(value);
  }
  return (
    <Input
      type="number"
      min={1}
      max={10}
      inputMode="numeric"
      aria-label="tries"
      className="w-24 font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      {...invalidProps(problem)}
      value={typed}
      onChange={(e) => {
        setTyped(e.target.value);
        if (/^-?\d+$/.test(e.target.value)) onChange(Number(e.target.value));
      }}
    />
  );
}

/** A matrix key field: a name that matches `PARAM` is written, any other text stays in the field. */
function MatrixKey({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <TextField
      value={value}
      mono
      label="key"
      same={(typed, v) => typed === v || !PARAM.test(typed)}
      onChange={(key) => {
        if (PARAM.test(key)) onChange(key);
      }}
    />
  );
}

/** The on-fail as the operations write it, from the source; `null` when it names no prompt. */
const onFailOf = (o: OnFailSource): OnFail | null => (o.name === null ? null : { name: o.name, with: Object.entries(o.with), model: o.model });

/** The model select's options: "from the prompt" (the key not written), then each model; the value as written first when invalid. */
function modelChoice(written: string | null, promptModel: string | null) {
  const fromPrompt = promptModel === null ? "none · the prompt sets none" : `${promptModel} · from the prompt`;
  return withInvalid(written ?? UNSET, [UNSET, ...MODELS], { [UNSET]: fromPrompt });
}

/** The Settings of step `index`. */
function Settings({ source, index, ctx, apply, errors }: { source: WorkflowSource; index: number; ctx: PromptContext; apply: Apply; errors: readonly StepError[] }) {
  const step = source.steps[index] as StepSource;
  const runsOn = effectiveRunsOn(step.runsOn, source.runsOn);
  const stepNames = ctx.steps.map((p) => p.item.name);
  const stepUses = stepNames.map(usesOf);
  const inputRefs = source.inputs.map((i) => `\${{ inputs.${i.name} }}`);
  const refs = step.matrix === null ? inputRefs : [...inputRefs, `\${{ matrix.${step.matrix.key} }}`];
  const onFail = step.onFail === null ? null : onFailOf(step.onFail);
  const promptModel = ctx.info(step.name)?.item.model ?? null;
  const showModel = runsOn === "agents" || step.model !== null;
  const showOnFailModel = onFail !== null && (runsOn === "agents" || onFail.model !== null);
  const showTries = step.onFail !== null || step.tries !== null;

  // The keys with a field shown; a line of any other key goes to the top of the panel.
  const shown = new Set(["uses", "runs-on", "with", "matrix", "on-fail", "on-fail.uses"]);
  if (showModel) shown.add("model");
  if (onFail !== null) shown.add("on-fail.with");
  if (showOnFailModel) shown.add("on-fail.model");
  if (showTries) shown.add("tries");
  const at = (...keys: string[]): FieldProblem => ({
    id: `step-${keys[0]?.replace(".", "-")}`,
    messages: errors.filter((e) => e.key !== null && keys.includes(e.key)).map((e) => e.message),
  });
  const top = errors.filter((e) => e.key === null || !shown.has(e.key));

  const usesChoice = stepUses.includes(step.uses) ? stepUses : [step.uses, ...stepUses];
  const runsOnChoice = withInvalid(step.runsOn ?? UNSET, [UNSET, ...RUNS_ON], {
    [UNSET]: `${source.runsOn ?? "not set"} · from the workflow`,
  });
  const model = modelChoice(step.model, promptModel);
  const onFailValue = step.onFail === null ? NONE : step.onFail.uses === "" ? UNSET : step.onFail.uses;
  // A map with no `uses` shows "not set" first; any other value that is not a step prompt comes right after `none`.
  const onFailOptions =
    onFailValue === UNSET ? [UNSET, NONE, ...stepUses] : [NONE, ...(onFailValue === NONE || stepUses.includes(onFailValue) ? [] : [onFailValue]), ...stepUses];
  const onFailModel = onFail === null ? null : modelChoice(onFail.model, ctx.info(onFail.name)?.item.model ?? null);
  const writeOnFail = (next: OnFail) => apply((d) => setStepOnFail(d, index, next));
  const matrix = step.matrix;

  return (
    <div className="flex flex-col gap-4">
      {top.length > 0 && <Problems problem={{ id: "step-top", messages: top.map((e) => (e.key === null ? e.message : `${e.key}: ${e.message}`)) }} />}
      <Row label={<Key>uses</Key>} note={ctx.info(step.name)?.item.description ?? undefined} problem={at("uses")}>
        <Choice
          label="uses"
          value={step.uses}
          options={usesChoice}
          problem={at("uses")}
          onChange={(v) => {
            const name = stepNames[stepUses.indexOf(v)];
            if (name === undefined) return;
            apply((d) => setStepPrompt(d, index, name, declaredOf(ctx, name) ?? Object.keys(step.with), requiredOf(ctx, name)));
          }}
        />
      </Row>
      <Row label={<Key>runs-on</Key>} problem={at("runs-on")}>
        <Choice
          label="runs-on"
          value={step.runsOn ?? UNSET}
          options={runsOnChoice.options}
          labels={runsOnChoice.labels}
          problem={at("runs-on")}
          onChange={(v) => apply((d) => setStepField(d, index, "runs-on", v === UNSET ? undefined : v))}
        />
      </Row>
      {showModel && (
        <Row label={<Key>model</Key>} problem={at("model")}>
          <Choice
            label="model"
            value={step.model ?? UNSET}
            options={model.options}
            labels={model.labels}
            problem={at("model")}
            onChange={(v) => apply((d) => setStepField(d, index, "model", v === UNSET ? undefined : v))}
          />
        </Row>
      )}
      <Row label={<Key>with</Key>} group problem={at("with")}>
        <WithRows
          ctx={ctx}
          name={step.name}
          values={step.with}
          refs={refs}
          problem={at("with")}
          set={(input, v) => apply((d) => setStepWith(d, index, input, v))}
        />
      </Row>
      <Row label={<Key>matrix</Key>} group problem={at("matrix")}>
        <Choice
          label="matrix"
          value={matrix === null ? "none" : "values"}
          options={["none", "values"]}
          labels={{ values: "one copy per value" }}
          problem={at("matrix")}
          onChange={(v) => apply((d) => setStepMatrix(d, index, v === "none" ? undefined : { key: "item", values: ["value"] }))}
        />
        {matrix !== null && (
          <div className="flex flex-col gap-2 border-l-2 border-divider pl-3">
            <Row label={<Key>key</Key>}>
              <MatrixKey value={matrix.key} onChange={(key) => apply((d) => setStepMatrix(d, index, { key, values: matrix.values }))} />
            </Row>
            {matrix.values.map((v, i) => (
              // By position, so an edit keeps the focus in its field.
              <div key={i} className="flex items-center gap-1">
                <TextField
                  value={v}
                  mono
                  label={`value ${i + 1}`}
                  onChange={(next) => apply((d) => setStepMatrix(d, index, { key: matrix.key, values: matrix.values.map((x, j) => (j === i ? next : x)) }))}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    const values = matrix.values.filter((_, j) => j !== i);
                    apply((d) => setStepMatrix(d, index, values.length === 0 ? undefined : { key: matrix.key, values }));
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-primary"
              onClick={() => apply((d) => setStepMatrix(d, index, { key: matrix.key, values: [...matrix.values, "value"] }))}
            >
              <Plus /> Add a value
            </Button>
          </div>
        )}
      </Row>
      <Row label={<Key>on-fail</Key>} group problem={at("on-fail", "on-fail.uses")}>
        <Choice
          label="on-fail"
          value={onFailValue}
          options={onFailOptions}
          labels={{ [NONE]: "none", [UNSET]: "not set" }}
          problem={at("on-fail", "on-fail.uses")}
          onChange={(v) => {
            if (v === NONE) {
              apply((d) => setStepOnFail(d, index, undefined));
              return;
            }
            const name = stepNames[stepUses.indexOf(v)];
            if (name === undefined) return;
            const declared = declaredOf(ctx, name);
            const current = step.onFail === null ? [] : Object.entries(step.onFail.with);
            const kept = current.filter(([k]) => declared === null || declared.includes(k));
            const added = requiredOf(ctx, name).flatMap((k) => (kept.some(([w]) => w === k) ? [] : [[k, ""] as [string, string]]));
            const model = step.onFail?.model ?? null;
            // Only the required inputs added here are named after the workflow's inputs.
            apply((d) => setStepOnFail(d, index, { name, with: [...kept, ...prefillOnFail(d, { name, with: added, model }).with], model }));
          }}
        />
        {onFail !== null && (
          <div className="flex flex-col gap-3 border-l-2 border-divider pl-3">
            <Row label={<Key>with</Key>} group problem={at("on-fail.with")}>
              <WithRows
                ctx={ctx}
                name={onFail.name}
                values={Object.fromEntries(onFail.with)}
                refs={inputRefs}
                problem={at("on-fail.with")}
                set={(input, v) => {
                  const i = onFail.with.findIndex(([k]) => k === input);
                  const entry: [string, string][] = v === undefined ? [] : [[input, v]];
                  const next = i === -1 ? [...onFail.with, ...entry] : [...onFail.with.slice(0, i), ...entry, ...onFail.with.slice(i + 1)];
                  writeOnFail({ ...onFail, with: next });
                }}
              />
            </Row>
            {showOnFailModel && onFailModel !== null && (
              <Row label={<Key>model</Key>} problem={at("on-fail.model")}>
                <Choice
                  label="model"
                  value={onFail.model ?? UNSET}
                  options={onFailModel.options}
                  labels={onFailModel.labels}
                  problem={at("on-fail.model")}
                  onChange={(m) => writeOnFail({ ...onFail, model: m === UNSET ? null : m })}
                />
              </Row>
            )}
          </div>
        )}
      </Row>
      {showTries && (
        <Row label={<Key>tries</Key>} problem={at("tries")}>
          <TriesField value={step.tries ?? ""} problem={at("tries")} onChange={(n) => apply((d) => setStepTries(d, index, n))} />
        </Row>
      )}
    </div>
  );
}

/** The Prompt text tab: the step's prompt body, read-only, with a link to its page; or that its `uses` names no prompt. */
function PromptText({ step, ctx }: { step: StepSource; ctx: PromptContext }) {
  const item = ctx.info(step.name)?.item;
  const detail = useFile(item ?? { scope: "global", key: null, kind: "prompts", name: "" }, item !== undefined);
  if (item === undefined) return <p className="break-words text-muted-foreground">{step.uses} not found</p>;
  const html = detail.data !== undefined && detail.data.kind === "prompts" ? detail.data.resolved.html : null;
  return (
    <div className="flex flex-col gap-3">
      <Link href={fileHref(item)} className="self-start font-medium text-primary hover:underline">
        Open the prompt
      </Link>
      {html === null ? (
        <Empty error={detail.isError}>{detail.isError ? detail.error.message : "Loading…"}</Empty>
      ) : (
        // Rendered with raw HTML escaped; the CSP is the second layer.
        <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}

/** The panel of step `index`: its header, the Settings and Prompt text tabs, and Remove step. */
export function StepPanel({
  source,
  index,
  ctx,
  apply,
  errors,
  close,
}: {
  source: WorkflowSource;
  index: number;
  ctx: PromptContext;
  apply: Apply;
  errors: readonly StepError[];
  close: () => void;
}) {
  const step = source.steps[index] as StepSource;
  const [tab, setTab] = useState("settings");
  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="flex items-start gap-3">
        <StepTile runsOn={effectiveRunsOn(step.runsOn, source.runsOn)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12px] text-muted-foreground">
            Step {index + 1} of {source.steps.length}
          </span>
          <h2 className="truncate text-[16px] font-semibold">{cardTitle(step.uses)}</h2>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={close}>
          <X />
        </Button>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="flex-1 gap-4">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="settings">
            Settings
          </TabsTrigger>
          <TabsTrigger value="text">
            Prompt text
          </TabsTrigger>
        </TabsList>
        <TabsContent value="settings">
          <Settings key={index} source={source} index={index} ctx={ctx} apply={apply} errors={errors} />
        </TabsContent>
        <TabsContent value="text">
          <PromptText step={step} ctx={ctx} />
        </TabsContent>
      </Tabs>
      <div className="flex justify-end border-t border-divider pt-3">
        <Button
          variant="outline"
          className="text-destructive"
          onClick={() => {
            apply((d) => removeStep(d, index));
            close();
          }}
        >
          Remove step
        </Button>
      </div>
    </div>
  );
}
