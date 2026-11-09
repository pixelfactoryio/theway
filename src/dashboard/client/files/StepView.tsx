import { cn } from "cn";
import { Plus } from "lucide-react";
import { Fragment, type MouseEvent, type ReactNode, useMemo } from "react";
import { parseDocument } from "yaml";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Construct } from "./constructs";
import { outline, pathKey, type Selection, selectsNode } from "./selection";
import { type ParamNode, type StepNode, stepSource, type Written, type YamlPath } from "./source";
import { Broken, Card } from "./WorkflowView";

/** A value or a name as written, in the mono font. */
const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono text-[13px]">{children}</span>;

/** Each value in the mono font, joined with ", ". */
function Joined({ values }: { values: string[] }) {
  return (
    <>
      {values.map((v, i) => (
        <Fragment key={`${i}:${v}`}>
          {i > 0 && ", "}
          <Mono>{v}</Mono>
        </Fragment>
      ))}
    </>
  );
}

const values = (w: Written): string[] => (Array.isArray(w) ? w : [w]);


/** Edit mode of the step drawing: the selection, the tied constructs (by path key), and the edits. */
export type StepEditing = {
  selected: Selection;
  tied: ReadonlySet<string>;
  select: (s: Selection) => void;
  insert: (parent: YamlPath, index: number, construct: Construct) => void;
  addParam: () => void;
};

/** Where a node sits: the edit mode, and whether a loop or a for-each holds it. */
type Ctx = { edit: StepEditing | undefined; inLoop: boolean; inForeach: boolean };

/** A click that selects, without reaching the drawing area's background. */
const selecting = (edit: StepEditing | undefined, s: Selection) =>
  edit === undefined
    ? undefined
    : (e: MouseEvent) => {
        e.stopPropagation();
        edit.select(s);
      };

/** A 24px `+` button. */
export const PlusButton = (props: { "aria-label": string }) => (
  <Button variant="outline" size="icon-xs" {...props}>
    <Plus />
  </Button>
);

/** The `+` of a `do` list at `index`: Agent, Loop (not inside a loop), When, For each (not inside a for-each). */
function DoPlus({ parent, index, ctx }: { parent: YamlPath; index: number; ctx: Ctx }) {
  const edit = ctx.edit as StepEditing;
  const items: [Construct, string][] = [
    ["agent", "Agent"],
    ...(ctx.inLoop ? [] : ([["loop", "Loop"]] as [Construct, string][])),
    ["when", "When"],
    ...(ctx.inForeach ? [] : ([["foreach", "For each"]] as [Construct, string][])),
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<PlusButton aria-label="Add" />} />
      <DropdownMenuContent className="w-40">
        {items.map(([c, label]) => (
          <DropdownMenuItem key={c} onClick={() => edit.insert(parent, index, c)}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A `do` list: its nodes, with a `+` between two of them and after the last in edit mode. */
function DoList({ list, parent, step, top, ctx }: { list: StepNode[]; parent: YamlPath; step: string; top: boolean; ctx: Ctx }) {
  return (
    <>
      {list.map((n, i) => (
        <Fragment key={pathKey(n.path)}>
          {ctx.edit !== undefined && i > 0 && <DoPlus parent={parent} index={i} ctx={ctx} />}
          <Node node={n} step={step} top={top} ctx={ctx} />
        </Fragment>
      ))}
      {ctx.edit !== undefined && <DoPlus parent={parent} index={list.length} ctx={ctx} />}
    </>
  );
}

/** A bordered group: its sentence, then its children. */
function Group({ node, sentence, top, ctx, children }: { node: StepNode; sentence: ReactNode; top: boolean; ctx: Ctx; children: ReactNode }) {
  const { edit } = ctx;
  const ring = edit === undefined ? "" : outline(selectsNode(edit.selected, node.path), edit.tied.has(pathKey(node.path)));
  return (
    <div className={cn("flex w-full flex-col gap-2 rounded-md border p-3", top && "max-w-[400px] bg-background", edit !== undefined && "items-center", ring)}>
      <div className={cn("w-full", edit !== undefined && "cursor-pointer")} onClick={selecting(edit, { node: node.path })}>
        {sentence}
      </div>
      {children}
    </div>
  );
}

/** A card of a group: on the left the names, on the right a 12px muted note. */
function Leaf({ node, top, ctx, children, note }: { node: StepNode; top: boolean; ctx: Ctx; children: ReactNode; note?: ReactNode }) {
  const { edit } = ctx;
  const body = (
    <div className="flex items-baseline justify-between gap-3">
      <span>{children}</span>
      {note !== undefined && <span className="shrink-0 text-[12px] text-muted-foreground">{note}</span>}
    </div>
  );
  if (edit === undefined) return top ? <Card>{body}</Card> : <div className="rounded-md border bg-background px-3 py-2.5">{body}</div>;
  const ring = outline(selectsNode(edit.selected, node.path), edit.tied.has(pathKey(node.path)));
  return (
    <div className={cn("w-full cursor-pointer rounded-md border bg-background px-3 py-2.5", top && "max-w-[400px]", ring)} onClick={selecting(edit, { node: node.path })}>
      {body}
    </div>
  );
}

function Node({ node, step, top, ctx }: { node: StepNode; step: string; top: boolean; ctx: Ctx }) {
  switch (node.kind) {
    case "agent":
      return (
        <Leaf node={node} top={top} ctx={ctx} note={`${node.returns}${node.access === null ? "" : ` · ${node.access}`}`}>
          <Joined values={node.prompts.length === 0 ? [step] : node.prompts} />
        </Leaf>
      );
    case "loop":
      return (
        <Group
          node={node}
          top={top}
          ctx={ctx}
          sentence={
            <>
              Repeat up to <Mono>{node.max}</Mono> times, until <Joined values={node.until} />
            </>
          }
        >
          <DoList list={node.children} parent={[...node.path, "loop", "do"]} step={step} top={false} ctx={{ ...ctx, inLoop: true }} />
        </Group>
      );
    case "foreach":
      return (
        <Group
          node={node}
          top={top}
          ctx={ctx}
          sentence={
            <>
              For each of <Joined values={values(node.value)} />
              {node.parallel && ", in parallel"}
            </>
          }
        >
          <DoList list={node.children} parent={[...node.path, "do"]} step={step} top={false} ctx={{ ...ctx, inForeach: true }} />
        </Group>
      );
    case "when":
      return (
        <Group
          node={node}
          top={top}
          ctx={ctx}
          sentence={
            <>
              When <Joined values={node.conditions} />
            </>
          }
        >
          <DoList list={node.children} parent={[...node.path, "do"]} step={step} top={false} ctx={ctx} />
        </Group>
      );
    case "stop":
      return (
        <Leaf node={node} top={top} ctx={ctx} note={node.text ?? undefined}>
          When <Joined values={node.conditions} />: {node.stop}
        </Leaf>
      );
  }
}

/** A param's default as shown: a list joined with ", ". */
export const shown = (d: ParamNode["default"]): string => (d === null ? "" : Array.isArray(d) ? d.join(", ") : String(d));

function Params({ params, edit }: { params: ParamNode[]; edit: StepEditing | undefined }) {
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-2 rounded-md border bg-background p-3">
      <div>Params</div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px]">
        {params.map((p) => {
          if (edit === undefined) {
            return (
              <Fragment key={p.name}>
                <Mono>{p.name}</Mono>
                <span className="text-muted-foreground">{shown(p.default)}</span>
              </Fragment>
            );
          }
          const selected = edit.selected !== null && "param" in edit.selected && edit.selected.param === p.name;
          return (
            <div
              key={p.name}
              className={cn("col-span-2 grid cursor-pointer grid-cols-subgrid rounded-sm px-1", outline(selected, false))}
              onClick={selecting(edit, { param: p.name })}
            >
              <Mono>{p.name}</Mono>
              <span className="text-muted-foreground">{shown(p.default)}</span>
            </div>
          );
        })}
      </div>
      {edit !== undefined && (
        <div className="flex justify-center">
          <Button variant="outline" size="icon-xs" aria-label="Add param"
            onClick={(e) => {
              e.stopPropagation();
              edit.addParam();
            }}
          >
            <Plus />
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * A step file as written: its `do` tree as nested groups, then its params; or its first parse error above its text.
 * With `edit`, every `do` list and the Params box get their `+` buttons, and a click selects.
 */
export function StepView({ name, text, edit }: { name: string; text: string; edit?: StepEditing }) {
  const source = useMemo(() => stepSource(parseDocument(text)), [text]);
  if ("error" in source) return <Broken error={source.error} text={text} />;
  const ctx: Ctx = { edit, inLoop: false, inForeach: false };
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <DoList list={source.nodes} parent={["do"]} step={name} top={true} ctx={ctx} />
      {(source.params.length > 0 || edit !== undefined) && <Params params={source.params} edit={edit} />}
    </div>
  );
}
