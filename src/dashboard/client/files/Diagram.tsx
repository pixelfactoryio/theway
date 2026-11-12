/**
 * A workflow drawn as written: the inputs card, then one card per step joined by a line, a matrix step forked into one
 * card per value, an on-fail as a side card joined by two arrows, and a `+` under each card. The steps are moved by
 * their handle, only at 100%: the page pans and zooms the diagram, and every control a press must reach (the handles and
 * the `+` buttons) carries panzoom's exclude class. Plain CSS, nothing measured in script.
 */
import { cn } from "cn";
import { GripVertical, LogIn, Plus, RotateCw, Sparkles, User } from "lucide-react";
import { createContext, type HTMLAttributes, type ReactNode, useContext } from "react";
import { Link } from "wouter";
import { Sortable, SortableItem, SortableItemHandle } from "@/components/reui/sortable";
import { cardLabel, cardTitle, effectiveRunsOn, matrixText, onFailLabel } from "@/lib/workflows";
import type { PromptContext } from "./context";
import type { StepSource, WorkflowSource } from "./source";

/** What the page selects: a step by its index, or the workflow settings. */
export type Selection = { step: number } | "workflow";

/** The width class of a card of the column, full width below `lg`. */
const COLUMN_CARD = "w-full lg:w-[340px]";

/** A card's icon tile: neutral, or the primary tint for a step on agents, or the warning tint for an on-fail. */
function Tile({ tone, children, className }: { tone: "neutral" | "primary" | "warning"; children: ReactNode; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4",
        tone === "primary" ? "bg-primary/10 text-primary" : tone === "warning" ? "bg-warning/20 text-amber-700" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A step's icon tile from its effective runs-on: agents in the primary tint, anything else neutral. */
export function StepTile({ runsOn, className }: { runsOn: string | null; className?: string }) {
  return (
    <Tile tone={runsOn === "agents" ? "primary" : "neutral"} className={className}>
      {runsOn === "agents" ? <Sparkles /> : <User />}
    </Tile>
  );
}

/** The ring of a card: the primary colour when selected, else the destructive colour when it has an error. */
const ring = (selected: boolean, error: boolean): string => (selected ? "ring-2 ring-primary" : error ? "ring-2 ring-destructive" : "");

/**
 * A card: its tile, small label, title and third line, wrapped at word boundaries (a word longer than its line runs
 * into the card's padding), a button over the whole card that selects it, and an optional handle on its right edge
 * above that button.
 */
function Card({
  tile,
  label,
  title,
  line,
  selected,
  error,
  name,
  onSelect,
  handle,
  className,
}: {
  tile: ReactNode;
  label: string;
  title: string;
  line?: ReactNode;
  selected: boolean;
  error: boolean;
  name: string;
  onSelect: () => void;
  handle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative flex items-start gap-3 rounded-lg border bg-card p-3.5 text-left shadow-xs", ring(selected, error), className)}>
      {tile}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12px] text-muted-foreground">{label}</span>
        {title !== "" && <span className="font-semibold">{title}</span>}
        {line !== undefined && line !== null && line !== "" && <span className="text-muted-foreground">{line}</span>}
      </span>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={name}
        className="absolute inset-0 cursor-pointer rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={onSelect}
      />
      {handle}
    </div>
  );
}

/** The attributes dnd-kit gives a sortable item, moved from the list item to its handle, the one control that drags it. */
type HandleAttributes = Pick<HTMLAttributes<HTMLElement>, "aria-describedby" | "aria-disabled" | "aria-pressed" | "aria-roledescription">;
const HandleContext = createContext<HandleAttributes>({});

/**
 * A step's drag handle: on the right edge of a plain step's card, above the card's button, or on a matrix step's fork;
 * disabled while the view is zoomed.
 */
function Handle({ label, zoomed, className }: { label: string; zoomed: boolean; className?: string }) {
  const attributes = useContext(HandleContext);
  return (
    <SortableItemHandle
      render={<button type="button" disabled={zoomed} title={zoomed ? "Reset the view to move steps" : undefined} />}
      {...attributes}
      aria-label={label}
      className={cn(
        "panzoom-exclude relative z-10 -mr-1.5 flex size-8 shrink-0 items-center justify-center self-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-11",
        className,
      )}
    >
      <GripVertical className="size-4" />
    </SortableItemHandle>
  );
}

/** A vertical line of the column. */
const Line = ({ className }: { className?: string }) => <span aria-hidden="true" className={cn("mx-auto block w-px bg-input", className)} />;

/** A line with a round `+` on it; `last` reads "Add a step" beside the `+`. */
function AddButton({ last, onAdd, label }: { last: boolean; onAdd: () => void; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <Line className="h-3" />
      <button
        type="button"
        aria-label={last ? undefined : label}
        className="group/add panzoom-exclude flex cursor-pointer items-center justify-center gap-2 rounded-full font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:-my-2.5 pointer-coarse:min-h-10 pointer-coarse:min-w-10"
        onClick={onAdd}
      >
        <span className="flex size-5 items-center justify-center rounded-full border border-primary bg-card group-hover/add:bg-primary/10">
          <Plus className="size-3" />
        </span>
        {last && <span>Add a step</span>}
      </button>
      {!last && <Line className="h-3" />}
    </div>
  );
}

/** The width of a fork's bracket over 1, 2 or 3 cards a row, from the first card's middle to the last's; half the row below `lg`. */
const BRACKET = ["w-px border-l-0", "max-lg:w-1/2 lg:w-[276px]", "max-lg:w-1/2 lg:w-[552px]"];

/** The two arrows from a step's card to its on-fail card and back. */
function Arrows() {
  return (
    <svg aria-hidden="true" width="48" height="20" viewBox="0 0 48 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-1 shrink-0 text-amber-700">
      <path d="M2 6h42M39 2l5 4-5 4" />
      <path d="M46 14H4M9 10l-5 4 5 4" />
    </svg>
  );
}

/** What the diagram reads and does. */
export type DiagramProps = {
  source: WorkflowSource;
  ctx: PromptContext;
  selection: Selection | null;
  select: (s: Selection) => void;
  /** Whether the check names a field of the workflow settings. */
  workflowError: boolean;
  /** Whether the check names step `i`. */
  stepError: (i: number) => boolean;
  /** Opens the step picker to insert a step at `index`. */
  add: (index: number) => void;
  move: (from: number, to: number) => void;
  /** Set on the diagram's root element, the element the page pans and zooms. */
  rootRef: (el: HTMLDivElement | null) => void;
  /** Whether the view's scale is not 100%: the steps cannot be moved then. */
  zoomed: boolean;
  /** Called with `true` when a step starts being dragged, `false` when the drag ends or is cancelled. */
  onDragging: (dragging: boolean) => void;
};

/** The ID of the sortable item of step `i`. */
const idOf = (i: number) => `step-${i}`;

/** What a screen reader hears while a step is moved by its handle. */
const INSTRUCTIONS = {
  draggable: "To move a step, press Space or Enter on its handle, then the up and down arrows; Space or Enter drops it, Escape cancels.",
};

/** One step: its card or its fork, its on-fail card, then the line and `+` that insert after it. */
function StepItem({ step, index, count, props }: { step: StepSource; index: number; count: number; props: DiagramProps }) {
  const { source, ctx, selection, select } = props;
  const runsOn = effectiveRunsOn(step.runsOn, source.runsOn);
  const info = ctx.info(step.name);
  const label = cardLabel(runsOn, step.model ?? info?.item.model ?? null);
  const title = cardTitle(step.uses);
  const description = info?.item.description ?? null;
  const selected = typeof selection === "object" && selection !== null && selection.step === index;
  const error = props.stepError(index);
  const onSelect = () => select({ step: index });
  const handleLabel = `Reorder step ${index + 1}: ${title}`;
  const handle = <Handle label={handleLabel} zoomed={props.zoomed} />;
  const values = step.matrix?.values ?? [];
  const tile = <StepTile runsOn={runsOn} />;
  const name = (n: string) => `Step ${index + 1}: ${title}${n}`;
  const main =
    values.length === 0 || step.matrix === null ? (
      <Card tile={tile} label={label} title={title} line={description} selected={selected} error={error} name={name("")} onSelect={onSelect} handle={handle} className={COLUMN_CARD} />
    ) : (
      <div className="flex w-full flex-col items-center">
        {/* The handle stands on the fork's line, above the copies, none of which carries one. */}
        <Handle label={handleLabel} zoomed={props.zoomed} className="mr-0" />
        <span aria-hidden="true" className={cn("h-3 rounded-t-lg border-x border-t border-input", BRACKET[Math.min(values.length, 3) - 1])} />
        <div className="flex w-full flex-wrap justify-center gap-3 lg:max-w-[816px]">
          {values.map((v, i) => (
            <Card
              key={`${i}:${v}`}
              tile={<StepTile runsOn={runsOn} className="max-lg:size-6.5" />}
              label={label}
              title={title}
              line={matrixText(step.matrix?.key ?? "", v)}
              selected={selected}
              error={error}
              name={name(`, ${matrixText(step.matrix?.key ?? "", v)}`)}
              onSelect={onSelect}
              className="w-[calc(50%-6px)] max-lg:p-2.5 lg:w-[264px]"
            />
          ))}
        </div>
        <span aria-hidden="true" className={cn("h-3 rounded-b-lg border-x border-b border-input", BRACKET[Math.min(values.length, 3) - 1])} />
      </div>
    );
  const onFail =
    step.onFail === null ? null : (
      <Card
        tile={
          <Tile tone="warning">
            <RotateCw />
          </Tile>
        }
        label={onFailLabel(step.tries)}
        title={step.onFail.name ?? (step.onFail.uses === "" ? "no prompt" : step.onFail.uses)}
        selected={selected}
        error={error}
        name={`On-fail of step ${index + 1}: ${step.onFail.name ?? (step.onFail.uses || "no prompt")}`}
        onSelect={onSelect}
        className="w-full lg:w-[176px]"
      />
    );
  const last = index === count - 1;
  return (
    <>
      {/* From `lg`: three columns, the card in the middle and the on-fail on its right; below, one column. */}
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px_minmax(0,1fr)] lg:items-center">
        <div className={cn("flex justify-center", step.matrix !== null && values.length > 0 ? "lg:col-span-3" : "lg:col-start-2")}>{main}</div>
        {onFail !== null &&
          (step.matrix !== null && values.length > 0 ? (
            // A matrix step's on-fail: centred under the fork's join, joined to it by a vertical line; the line to the next `+` continues under it.
            <div className="flex flex-col items-center lg:col-span-3">
              <Line className="h-2 lg:h-3" />
              <div className="w-full lg:w-[176px]">{onFail}</div>
            </div>
          ) : (
            <>
              <div className="hidden items-center lg:col-start-3 lg:flex">
                <Arrows />
                {onFail}
              </div>
              <div className="mt-2 flex lg:hidden">
                <OnFailBelow>{onFail}</OnFailBelow>
              </div>
            </>
          ))}
      </div>
      <AddButton last={last} label={`Add a step after step ${index + 1}`} onAdd={() => props.add(index + 1)} />
    </>
  );
}

/** Below `lg`, a plain step's on-fail card under its step's, 8px below it, indented and joined to it by a corner line. */
function OnFailBelow({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full items-start pl-4">
      <span aria-hidden="true" className="-mt-2 mr-1 h-8 w-3 shrink-0 rounded-bl-md border-b border-l border-amber-600" />
      <div className="min-w-0 flex-1 lg:flex-none">{children}</div>
    </div>
  );
}

/** The diagram of a workflow's text, read as written. */
export function Diagram(props: DiagramProps) {
  const { source, selection, select } = props;
  const steps = source.steps;
  const ids = steps.map((_, i) => idOf(i));
  const at = (id: string | number): number => ids.indexOf(String(id));
  const said = (id: string | number): string => {
    const i = at(id);
    const step = steps[i];
    return step === undefined ? "the step" : `step ${i + 1}, ${cardTitle(step.uses)}`;
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
    <div ref={props.rootRef} className="mx-auto flex w-full max-w-[884px] flex-col">
      <div className="flex justify-center">
        <Card
          tile={
            <Tile tone="neutral">
              <LogIn />
            </Tile>
          }
          label="inputs"
          title=""
          line={
            source.inputs.length === 0 ? (
              "none"
            ) : (
              <span className="flex flex-col">
                {source.inputs.map((i) => (
                  <span key={i.name} className="flex flex-col">
                    <span className="font-semibold text-foreground">{i.name}</span>
                    {i.description !== "" && <span>{i.description}</span>}
                  </span>
                ))}
              </span>
            )
          }
          selected={selection === "workflow"}
          error={props.workflowError}
          name="Workflow settings"
          onSelect={() => select("workflow")}
          className={COLUMN_CARD}
        />
      </div>
      <AddButton last={steps.length === 0} label="Add a step before step 1" onAdd={() => props.add(0)} />
      {steps.length > 0 && (
        <Sortable
          value={ids}
          getItemValue={(id) => id}
          strategy="vertical"
          accessibility={{ announcements, screenReaderInstructions: INSTRUCTIONS }}
          render={<ol aria-label="Steps" className="flex flex-col" />}
          // A drop is one move from the old index to the new one; the draft's text then orders the cards.
          onMove={({ activeIndex, overIndex }) => props.move(activeIndex, overIndex)}
          onValueChange={() => {}}
          onDragStart={() => props.onDragging(true)}
          onDragEnd={() => props.onDragging(false)}
          onDragCancel={() => props.onDragging(false)}
        >
          {steps.map((step, i) => (
            <SortableItem
              key={idOf(i)}
              value={idOf(i)}
              // Reordering works only at 100%; a disabled item stays fully opaque.
              disabled={props.zoomed}
              className={props.zoomed ? "opacity-100" : undefined}
              // dnd-kit's role, tab stop and descriptions go to the handle, the list item stays a list item.
              render={({ role: _role, tabIndex: _tabIndex, ...rest }) => {
                const {
                  "aria-describedby": describedBy,
                  "aria-disabled": disabled,
                  "aria-pressed": pressed,
                  "aria-roledescription": roleDescription,
                  ...others
                } = rest as typeof rest & HandleAttributes;
                return (
                  <HandleContext.Provider
                    value={{ "aria-describedby": describedBy, "aria-disabled": disabled, "aria-pressed": pressed, "aria-roledescription": roleDescription }}
                  >
                    <li {...others} />
                  </HandleContext.Provider>
                );
              }}
            >
              <StepItem step={step} index={i} count={steps.length} props={props} />
            </SortableItem>
          ))}
        </Sortable>
      )}
    </div>
  );
}

/** In place of the cards, for a draft that cannot be drawn: why, and a link to the YAML view. */
export function NotDrawn({ error, yamlHref }: { error: string; yamlHref: string }) {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col items-center gap-2 py-10 text-center">
      <p className="break-words">This file cannot be drawn: {error}.</p>
      <Link href={yamlHref} className="font-medium text-primary hover:underline">
        Open the YAML view
      </Link>
    </div>
  );
}
