/** Edit mode's centre for a workflow: its steps as written, on a timeline whose cards are moved by a handle, with a `+` on the line. */
import { cn } from "cn";
import { GripVertical, Plus } from "lucide-react";
import { createContext, type HTMLAttributes, useContext } from "react";
import { Badge } from "@/components/reui/badge";
import { Sortable, SortableItem, SortableItemHandle } from "@/components/reui/sortable";
import { Timeline, TimelineContent, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator } from "@/components/reui/timeline";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PromptContext } from "./context";
import type { StepSource } from "./source";
import { matrixTitle, ON_FAIL_TITLE, promptName } from "./source";
import { Card, indicator, LINE, StepBadge } from "./WorkflowView";

/** The `+` button and its menu: every step prompt, by name with its description; a 32px target, 44px on touch, muted until pointed at or focused. */
function AddStep({ ctx, onPick, className }: { ctx: PromptContext; onPick: (name: string) => void; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" aria-label="Add a step" className={cn("group/add size-8 rounded-full p-0 hover:bg-transparent pointer-coarse:size-11", className)}>
            <span className="flex size-6 items-center justify-center rounded-full border border-input bg-card text-muted-foreground opacity-70 transition-opacity group-hover/add:opacity-100 group-hover/add:text-foreground group-focus-visible/add:opacity-100 group-aria-expanded/add:opacity-100">
              <Plus className="size-3.5" />
            </span>
          </Button>
        }
      />
      <DropdownMenuContent className="w-[min(360px,calc(100vw-2rem))]">
        {ctx.steps.length === 0 ? (
          <div className="px-2 py-1.5 text-muted-foreground">No step prompt</div>
        ) : (
          ctx.steps.map(({ item }) => (
            <DropdownMenuItem key={`${item.scope}/${item.name}`} onClick={() => onPick(item.name)} className="flex-col items-start gap-0">
              <span className="font-mono text-[13px]">{item.name}</span>
              {item.description !== null && <span className="text-[12px] text-muted-foreground">{item.description}</span>}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The attributes dnd-kit gives a sortable item, moved from the list item to its handle, the one control that drags it. */
type HandleAttributes = Pick<HTMLAttributes<HTMLElement>, "aria-describedby" | "aria-disabled" | "aria-pressed" | "aria-roledescription">;
const HandleContext = createContext<HandleAttributes>({});

/** A step's name as the editor shows it. */
const nameOf = (step: StepSource): string => step.name ?? (step.uses || "no prompt");

/**
 * A step's compact card: the drag handle, then a button that selects the step, with its prompt, its copies, its on
 * fail, `agent · <model>` or "your session", the prompt's description on one line, and its matrix values; a
 * destructive mark when the check names the step.
 */
function StepCard({
  step,
  index,
  runsOn,
  ctx,
  selected,
  problems,
  select,
}: {
  step: StepSource;
  index: number;
  runsOn: string;
  ctx: PromptContext;
  selected: boolean;
  problems: number;
  select: () => void;
}) {
  const tries = Number(step.tries ?? 1);
  const info = ctx.info(step.name);
  const model = step.model ?? info?.header?.model ?? null;
  const description = info?.item.description ?? null;
  const name = nameOf(step);
  const handle = useContext(HandleContext);
  return (
    <Card id={cardId(index)} className={cn("relative flex items-start gap-1 py-2.5 pl-1.5", selected ? "ring-2 ring-primary" : problems > 0 && "ring-2 ring-destructive")}>
      <SortableItemHandle
        render={<button type="button" />}
        {...handle}
        aria-label={`Reorder step ${index + 1}: ${name}`}
        className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-11"
      >
        <GripVertical className="size-4" />
      </SortableItemHandle>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Step ${index + 1}: ${name}${problems > 0 ? `, ${problems} ${problems > 1 ? "problems" : "problem"}` : ""}`}
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1.5 rounded-md pt-1 text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        onClick={(e) => {
          e.stopPropagation();
          select();
        }}
      >
        <span className="flex w-full flex-wrap items-center gap-2 pr-4">
          <span className="font-mono text-[14px] font-medium">{name}</span>
          {problems > 0 && <span title={`${problems} ${problems > 1 ? "problems" : "problem"}`} className="size-2 rounded-full bg-destructive" />}
          {step.matrix !== null && (
            <Badge variant="primary-light" title={matrixTitle(step.matrix.key)}>
              {step.matrix.values.length} copies at once
            </Badge>
          )}
          {step.onFail !== null && (
            <Badge variant="warning-light" title={ON_FAIL_TITLE}>
              on fail: {step.onFail.name ?? step.onFail.uses} · {Number.isFinite(tries) ? tries : step.tries} {tries > 1 ? "tries" : "try"}
            </Badge>
          )}
          <span className="ml-auto">
            <StepBadge runsOn={step.runsOn ?? runsOn} model={model} />
          </span>
        </span>
        {description !== null && description !== "" && <span className="w-full truncate pr-4 text-muted-foreground">{description}</span>}
        {step.matrix !== null && (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[12px] text-muted-foreground">{step.matrix.key}</span>
            {step.matrix.values.map((v, i) => (
              <Badge key={`${i}:${v}`} variant="secondary">
                {promptName(v) ?? v}
              </Badge>
            ))}
          </span>
        )}
      </button>
    </Card>
  );
}

/** What the workflow editor's centre reads and does. */
export type WorkflowEditing = {
  steps: StepSource[];
  runsOn: string;
  ctx: PromptContext;
  selected: number | null;
  /** The number of check lines that name each step, by index. */
  marked: ReadonlyMap<number, number>;
  select: (index: number | null) => void;
  insert: (index: number, name: string) => void;
  move: (from: number, to: number) => void;
};

/** The ID of the sortable item of step `i`. */
const idOf = (i: number) => `step-${i}`;

/** The ID of step `i`'s card, which "Back to steps" scrolls to. */
export const cardId = (i: number): string => `step-card-${i}`;

/** What a screen reader hears while a step is moved by its handle. */
const INSTRUCTIONS = {
  draggable: "To move a step, press Space or Enter on its handle, then the up and down arrows; Space or Enter drops it, Escape cancels.",
};

/** The workflow's steps on a timeline, an ordered list: each card selectable and moved by its handle, a `+` between two cards and after the last. */
export function WorkflowEdit({ steps, runsOn, ctx, selected, marked, select, insert, move }: WorkflowEditing) {
  const ids = steps.map((_, i) => idOf(i));
  const at = (id: string | number): number => ids.indexOf(String(id));
  const said = (id: string | number): string => {
    const i = at(id);
    const step = steps[i];
    return step === undefined ? "the step" : `step ${i + 1}, ${nameOf(step)}`;
  };
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) => `Picked up ${said(active.id)}.`,
    onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over === null ? `${said(active.id)} is over no position.` : `${said(active.id)} is over position ${at(over.id) + 1} of ${steps.length}.`,
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over === null ? `${said(active.id)} was dropped back.` : `${said(active.id)} was dropped at position ${at(over.id) + 1} of ${steps.length}.`,
    onDragCancel: ({ active }: { active: { id: string | number } }) => `Moving ${said(active.id)} was cancelled.`,
  };
  return (
    <div className="flex w-full max-w-[760px] flex-col">
      {/* The timeline holds the sortable list, so the drag overlay, portalled out of the list, still reads its context. */}
      <Timeline value={0} className="w-full pl-1">
        <Sortable
          value={ids}
          getItemValue={(id) => id}
          strategy="vertical"
          accessibility={{ announcements, screenReaderInstructions: INSTRUCTIONS }}
          render={<ol aria-label="Steps" className="flex flex-col" />}
          // A drop is one move from the old index to the new one; the draft's text then orders the cards.
          onMove={({ activeIndex, overIndex }) => move(activeIndex, overIndex)}
          onValueChange={() => {}}
        >
          {steps.map((step, i) => (
            <SortableItem
              key={idOf(i)}
              value={idOf(i)}
              // dnd-kit's role, tab stop and descriptions go to the handle, the list item stays a list item.
              render={({ role: _role, tabIndex: _tabIndex, ...props }) => {
                const {
                  "aria-describedby": describedBy,
                  "aria-disabled": disabled,
                  "aria-pressed": pressed,
                  "aria-roledescription": roleDescription,
                  ...rest
                } = props as typeof props & HandleAttributes;
                return (
                  <HandleContext.Provider
                    value={{ "aria-describedby": describedBy, "aria-disabled": disabled, "aria-pressed": pressed, "aria-roledescription": roleDescription }}
                  >
                    <TimelineItem step={i + 1} render={<li />} {...rest} />
                  </HandleContext.Provider>
                );
              }}
            >
              <TimelineHeader>
                <TimelineSeparator className={LINE} />
                <TimelineIndicator className={indicator(selected === i)}>{i + 1}</TimelineIndicator>
              </TimelineHeader>
              <TimelineContent className="text-foreground">
                <StepCard
                  step={step}
                  index={i}
                  runsOn={runsOn}
                  ctx={ctx}
                  selected={selected === i}
                  problems={marked.get(i) ?? 0}
                  select={() => select(i)}
                />
              </TimelineContent>
              {i < steps.length - 1 && (
                // On the line, in the middle of the gap between two cards.
                <div className="absolute bottom-3 left-[-1.5rem] z-10">
                  <AddStep ctx={ctx} onPick={(name) => insert(i + 1, name)} className="absolute -translate-x-1/2 -translate-y-1/2" />
                </div>
              )}
            </SortableItem>
          ))}
        </Sortable>
      </Timeline>
      {/* Under the line: 12px from the timeline's left edge. */}
      <div className="relative mt-1 h-8 pointer-coarse:h-11">
        <AddStep ctx={ctx} onPick={(name) => insert(steps.length, name)} className="absolute top-0 left-3 -translate-x-1/2" />
      </div>
    </div>
  );
}
