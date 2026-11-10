/** The workflow page's drawing: its steps as a timeline of cards, the legend of answers, and its right-column panels. */
import { cn } from "cn";
import { Fragment, type ReactNode, useMemo } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/reui/badge";
import { Timeline, TimelineContent, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator } from "@/components/reui/timeline";
import { type FileRef, fileHref, useFiles } from "@/lib/api";
import type { ResolvedStep, ResolvedWorkflow } from "../../../core/language-schema";
import type { FilesResponse, PromptItem, WorkflowResolved } from "../../types";
import { parse } from "../editor/ops";
import { promptName } from "./source";

/** A card of the centre and the right column: the card colour, a border, rounded, a light shadow. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border bg-card px-4 py-3 shadow-xs", className)}>{children}</div>;
}

/** The small-capitals heading of the file list's groups and the right column's panels. */
export const SMALL_CAPS = "text-[11px] font-medium tracking-wide text-muted-foreground uppercase";

/** A panel of the right column: a card with a small-capitals heading, and an optional action at its right. */
export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-1.5 px-3.5">
      <div className="flex min-h-5 items-center gap-2">
        <span className={SMALL_CAPS}>{title}</span>
        {action !== undefined && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </Card>
  );
}

/** Where a workflow or a step runs, in words. */
export const runsOnText = (runsOn: string): string => (runsOn === "session" ? "Your session" : runsOn === "agents" ? "Agents" : runsOn);

/** A model's badge: `info-light` for opus, `secondary` for the others. */
export function ModelBadge({ model }: { model: string }) {
  return <Badge variant={model === "opus" ? "info-light" : "secondary"}>{model}</Badge>;
}

/** A line as the page shows it: the `theway: ` after an optional `<label>: ` removed. */
export function shownLine(line: string, labels: string[]): string {
  if (line.startsWith("theway: ")) return line.slice("theway: ".length);
  for (const label of labels) {
    const prefixed = `${label}: theway: `;
    if (line.startsWith(prefixed)) return `${label}: ${line.slice(prefixed.length)}`;
  }
  return line;
}

/** Error lines, one per line. */
function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((l) => (
        <p key={l} className="text-destructive break-words">
          {shownLine(l, [])}
        </p>
      ))}
    </>
  );
}

/** A file that cannot be drawn: its error lines, what can still be drawn, then its text. */
export function Broken({ lines, text, children }: { lines: string[]; text: string; children?: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-3">
      <Lines lines={lines} />
      {children}
      <pre className="overflow-x-auto rounded-lg border bg-card p-3 font-mono text-[13px]">{text}</pre>
    </div>
  );
}

/** The prompt file a workflow reads by name: a project workflow's own project file first, then the global one. */
export function promptFor(files: FilesResponse | undefined, file: FileRef, name: string): PromptItem | undefined {
  const prompts = files?.prompts ?? [];
  const own = file.scope === "project" ? prompts.find((p) => p.scope === "project" && p.key === file.key && p.name === name) : undefined;
  return own ?? prompts.find((p) => p.scope === "global" && p.name === name);
}

/** A prompt's name in the mono font, a link to its page when the list has it. */
function PromptLink({ item, name, className }: { item: PromptItem | undefined; name: string; className?: string }) {
  if (item === undefined) return <span className={cn("font-mono", className)}>{name}</span>;
  return (
    <Link href={fileHref(item)} className={cn("font-mono hover:underline", className)}>
      {name}
    </Link>
  );
}

/** One step's card: its prompt, its copies and model, its description, its matrix, its on fail, its other inputs. */
function StepCard({ file, step }: { file: FileRef; step: ResolvedStep }) {
  const files = useFiles();
  const name = promptName(step.uses) ?? step.uses;
  const byPath = (path: string) => files.data?.prompts.find((p) => p.path === path);
  const onFailName = step.on_fail === null ? null : (promptName(step.on_fail.uses) ?? step.on_fail.uses);
  const tries = step.tries ?? 1;
  return (
    <Card className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <PromptLink item={byPath(step.file)} name={name} className="text-[14px] font-medium" />
        {step.matrix !== null && <Badge variant="primary-light">{step.matrix.values.length} copies at once</Badge>}
        <span className="ml-auto">
          {step.runs_on === "session" ? <Badge variant="outline">your session</Badge> : step.model !== null && <ModelBadge model={step.model} />}
        </span>
      </div>
      {step.description !== "" && <p className="text-muted-foreground">{step.description}</p>}
      {step.matrix !== null && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[12px] text-muted-foreground">{step.matrix.key}</span>
          {step.matrix.values.map((v) => {
            const n = promptName(v);
            const item = n === null ? undefined : promptFor(files.data, file, n);
            return (
              <Badge key={v} variant="secondary" render={item === undefined ? undefined : <Link href={fileHref(item)} />}>
                {n ?? v}
              </Badge>
            );
          })}
        </div>
      )}
      {step.on_fail !== null && onFailName !== null && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="warning-light">on fail</Badge>
          <span>
            run <PromptLink item={byPath(step.on_fail.file)} name={onFailName} />, then this step again · up to {tries} {tries > 1 ? "tries" : "try"}
          </span>
        </div>
      )}
      {Object.keys(step.with).length > 0 && (
        <div className="flex flex-col font-mono text-[12px] text-muted-foreground">
          {Object.entries(step.with).map(([k, v]) => (
            <span key={k} className="break-all">
              {k}: {v === null ? "" : String(v)}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

/** The classes of a timeline's line and of its indicators, neutral; the selected step's indicator is in the primary colour. */
export const LINE = "bg-input group-data-[orientation=vertical]/timeline:h-[calc(100%-1.5rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-6.5";
export const indicator = (selected: boolean): string =>
  cn(
    "flex size-6 items-center justify-center text-[11px] font-medium",
    selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground",
  );

/** The timeline: one item per card, numbered from 1, joined by a line; no step is selected. */
function Steps({ cards }: { cards: ReactNode[] }) {
  return (
    <Timeline value={0} className="w-full max-w-[640px] pl-1">
      {cards.map((card, i) => (
        <TimelineItem key={i} step={i + 1}>
          <TimelineHeader>
            <TimelineSeparator className={LINE} />
            <TimelineIndicator className={indicator(false)}>{i + 1}</TimelineIndicator>
          </TimelineHeader>
          <TimelineContent className="text-foreground">{card}</TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}

/** The legend under the timeline: the answers a step gives. */
function Legend() {
  return (
    <div className="flex w-full max-w-[640px] flex-wrap items-center gap-1.5 pl-1 text-muted-foreground">
      <span>Every step answers</span>
      <Badge variant="success-light">pass</Badge>
      <Badge variant="destructive-light">fail</Badge>
      <Badge variant="warning-light">blocked</Badge>
      <span>a fail with no on fail, and any blocked, stops the run</span>
    </div>
  );
}

/** The step a resolver line names in the workflow `name`: its `steps[<i>]` index, `null` for none. */
const stepOf = (line: string, name: string): number | null => {
  const m = new RegExp(`^workflows/${name}\\.yaml: steps\\[(\\d+)\\]`).exec(line);
  return m === null ? null : Number(m[1]);
};

/** The `uses` each step of a workflow's text writes, as written; `[]` when it has no list of steps. */
function usesOf(text: string): string[] {
  const doc = parse(text);
  if (doc.errors.length > 0) return [];
  const steps = (doc.toJS() as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) return [];
  return steps.map((s) => {
    const uses = s !== null && typeof s === "object" ? (s as { uses?: unknown }).uses : undefined;
    return typeof uses === "string" ? (promptName(uses) ?? uses) : "";
  });
}

/** A workflow that does not resolve: its lines, each `steps[<i>]` line under the card of that step, then its text.
 * The step cards are drawn only when a line names one of them. */
function Unresolved({ name, errors, text }: { name: string; errors: string[]; text: string }) {
  const uses = useMemo(() => usesOf(text), [text]);
  const tied = (i: number) => errors.filter((l) => stepOf(l, name) === i);
  const untied = errors.filter((l) => {
    const i = stepOf(l, name);
    return i === null || i >= uses.length;
  });
  return (
    <Broken lines={untied} text={text}>
      {untied.length < errors.length && (
        <Steps
          cards={uses.map((u, i) => (
            <Fragment key={i}>
              <Card className="flex flex-col gap-1.5">
                <span className="font-mono text-[14px] font-medium">{u === "" ? `steps[${i}]` : u}</span>
                <Lines lines={tied(i)} />
              </Card>
            </Fragment>
          ))}
        />
      )}
    </Broken>
  );
}

/** The centre of a workflow page: its steps as a timeline, then the legend; or its error lines. */
export function WorkflowView({ file, resolved, text }: { file: FileRef; resolved: WorkflowResolved; text: string }) {
  if ("errors" in resolved) return <Unresolved name={file.name} errors={resolved.errors} text={text} />;
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <Steps cards={resolved.doc.steps.map((s) => <StepCard key={s.index} file={file} step={s} />)} />
      <Legend />
    </div>
  );
}

/** The Runs on and Inputs panels of a resolved workflow. */
export function WorkflowPanels({ doc }: { doc: ResolvedWorkflow }) {
  const inputs = Object.entries(doc.inputs);
  return (
    <>
      <Panel title="Runs on">
        <span>{runsOnText(doc.runs_on)}</span>
      </Panel>
      {inputs.length > 0 && (
        <Panel title="Inputs">
          {inputs.map(([name, input]) => (
            <div key={name} className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[13px]">{name}</span>
                {input.required ? (
                  <Badge variant="outline">required</Badge>
                ) : (
                  input.default !== null && <span className="text-[12px] text-muted-foreground">default: {input.default}</span>
                )}
              </div>
              <span className="text-[12px] text-muted-foreground">
                {input.description}
                {input.type === "change" && " · one run per ID"}
              </span>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}
