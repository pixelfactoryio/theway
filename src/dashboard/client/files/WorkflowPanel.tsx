/**
 * The workflow settings panel: `description`, `default`, `runs-on` and `inputs`, each labelled with its YAML key and
 * edited through one operation on the draft, the check's lines under the field they name; then where the file applies.
 */
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileRef } from "@/lib/api";
import { projectNames } from "@/lib/labels";
import { appliesText } from "@/lib/prompts";
import type { WorkflowKey } from "@/lib/workflows";
import { PARAM, RUNS_ON, WORKFLOW_INPUT_TYPES } from "../../../core/language-schema";
import type { FileDetail, FilesResponse } from "../../types";
import { addInput, removeInput, renameInput, setInputField, setWorkflowField, WORKFLOW_ORDER } from "../editor/ops";
import { Check, Choice, type FieldProblem, Problems, Row, TextField } from "./fields";
import type { WorkflowSource } from "./source";
import { type Apply, Key, withInvalid } from "./StepPanel";

/** The value of the runs-on select that stands for "not written". */
const UNSET = "\u0000unset";

/**
 * The other workflows that set `default: true` among those the default rule counts for `file`: for a project workflow,
 * its project's other files and the global ones it does not hide by name; for a global one, the other global files.
 */
export function otherDefaults(file: FileRef, files: FilesResponse): string[] {
  const global = files.workflows.filter((w) => w.scope === "global");
  const own = files.workflows.filter((w) => w.scope === "project" && w.key === file.key);
  const counted = file.scope === "global" ? global : [...own, ...global.filter((g) => !own.some((o) => o.name === g.name))];
  return counted.filter((w) => w.default && !(w.scope === file.scope && w.key === file.key && w.name === file.name)).map((w) => w.name);
}

/** The note beside `default`: `· <name> is the default` for one, `· <a>, <b> set default` for several; `null` for none. */
export function defaultNote(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return names.length === 1 ? `· ${names[0]} is the default` : `· ${names.join(", ")} set default`;
}

export function WorkflowPanel({
  file,
  source,
  apply,
  errors,
  files,
  detail,
  close,
}: {
  file: FileRef;
  source: WorkflowSource;
  apply: Apply;
  errors: readonly { key: WorkflowKey; input: string | null; message: string }[];
  files: FilesResponse | undefined;
  detail: FileDetail | undefined;
  close: () => void;
}) {
  const at = (key: WorkflowKey, input: string | null = null): FieldProblem => ({
    id: `workflow-${key}${input === null ? "" : `-${input}`}`,
    messages: errors.filter((e) => e.key === key && e.input === input).map((e) => e.message),
  });
  const names = source.inputs.map((i) => i.name);
  // A line about an input the panel does not show goes under the `inputs` heading.
  const inputsProblem: FieldProblem = {
    id: "workflow-inputs",
    messages: errors.filter((e) => e.key === "inputs" && (e.input === null || !names.includes(e.input))).map((e) => (e.input === null ? e.message : `${e.input}: ${e.message}`)),
  };
  const note = files === undefined ? null : defaultNote(otherDefaults(file, files));
  const runsOn = source.runsOn === null ? { options: [UNSET, ...RUNS_ON], labels: { [UNSET]: "not set" } } : withInvalid(source.runsOn, RUNS_ON, {});
  const label = file.key === null ? null : (files?.projects.find((p) => p.key === file.key)?.label ?? null);
  const applies = { scope: file.scope, key: file.key, label };
  const projectNamed = projectNames((files?.projects ?? []).map((p) => p.label));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-[16px] font-semibold">Workflow settings</h2>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={close}>
          <X />
        </Button>
      </div>
      <Row label={<Key>description</Key>} problem={at("description")}>
        <TextField value={source.description} multiline problem={at("description")} onChange={(v) => apply((d) => setWorkflowField(d, "description", v))} />
      </Row>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-1.5">
          <Check checked={source.default} problem={at("default")} onChange={(on) => apply((d) => setWorkflowField(d, "default", on ? true : undefined))}>
            <Key>default</Key>
          </Check>
          {note !== null && <span className="text-[12px] text-muted-foreground">{note}</span>}
        </div>
        <Problems problem={at("default")} />
      </div>
      <Row label={<Key>runs-on</Key>} problem={at("runs-on")}>
        <Choice
          value={source.runsOn ?? UNSET}
          options={runsOn.options}
          labels={runsOn.labels}
          problem={at("runs-on")}
          onChange={(v) => {
            if (v !== UNSET && RUNS_ON.includes(v as (typeof RUNS_ON)[number])) apply((d) => setWorkflowField(d, "runs-on", v));
          }}
        />
      </Row>
      <div role="group" aria-label="inputs" className="flex flex-col gap-2 border-t border-divider pt-4">
        <Key>inputs</Key>
        <Problems problem={inputsProblem} />
        {source.inputs.map((input, i) => {
          const type = withInvalid(input.type, WORKFLOW_INPUT_TYPES, {});
          return (
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
              <Row label={<Key>type</Key>}>
                <Choice
                  value={input.type}
                  options={type.options}
                  labels={type.labels}
                  onChange={(v) => {
                    if (v === "text") apply((d) => setInputField(d, input.name, "type", undefined));
                    else if (v === "change") apply((d) => setInputField(d, input.name, "type", "change"));
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
          );
        })}
        <Button variant="ghost" size="sm" className="self-start text-primary" onClick={() => apply((d) => void addInput(d, WORKFLOW_ORDER))}>
          <Plus /> Add an input
        </Button>
      </div>
      <div className="flex flex-col gap-1 border-t border-divider pt-4">
        <span className="font-medium">Applies to</span>
        <span title={appliesText(applies, detail?.overriddenBy ?? [], detail?.overrides ?? false)}>
          {appliesText(applies, detail?.overriddenBy ?? [], detail?.overrides ?? false, projectNamed)}
        </span>
      </div>
    </div>
  );
}
