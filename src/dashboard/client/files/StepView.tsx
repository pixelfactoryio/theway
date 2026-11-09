import { Fragment, type ReactNode, useMemo } from "react";
import { parseDocument } from "yaml";
import { type ParamNode, type StepNode, stepSource, type Written } from "./source";
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

/** A bordered group: its sentence, then its children. */
function Group({ sentence, top, children }: { sentence: ReactNode; top: boolean; children: ReactNode }) {
  return (
    <div className={`flex w-full flex-col gap-2 rounded-md border p-3 ${top ? "max-w-[400px] bg-background" : ""}`}>
      <div>{sentence}</div>
      {children}
    </div>
  );
}

/** A card of a group: on the left the names, on the right a 12px muted note. */
function Leaf({ top, children, note }: { top: boolean; children: ReactNode; note?: ReactNode }) {
  const body = (
    <div className="flex items-baseline justify-between gap-3">
      <span>{children}</span>
      {note !== undefined && <span className="shrink-0 text-[12px] text-muted-foreground">{note}</span>}
    </div>
  );
  return top ? <Card>{body}</Card> : <div className="rounded-md border bg-background px-3 py-2.5">{body}</div>;
}

function Node({ node, step, top }: { node: StepNode; step: string; top: boolean }) {
  const children = (list: StepNode[]) => list.map((n) => <Node key={n.path.join(".")} node={n} step={step} top={false} />);
  switch (node.kind) {
    case "agent":
      return (
        <Leaf top={top} note={`${node.returns}${node.access === null ? "" : ` · ${node.access}`}`}>
          <Joined values={node.prompts.length === 0 ? [step] : node.prompts} />
        </Leaf>
      );
    case "loop":
      return (
        <Group
          top={top}
          sentence={
            <>
              Repeat up to <Mono>{node.max}</Mono> times, until <Joined values={node.until} />
            </>
          }
        >
          {children(node.children)}
        </Group>
      );
    case "foreach":
      return (
        <Group
          top={top}
          sentence={
            <>
              For each of <Joined values={values(node.value)} />
              {node.parallel && ", in parallel"}
            </>
          }
        >
          {children(node.children)}
        </Group>
      );
    case "when":
      return (
        <Group
          top={top}
          sentence={
            <>
              When <Joined values={node.conditions} />
            </>
          }
        >
          {children(node.children)}
        </Group>
      );
    case "stop":
      return (
        <Leaf top={top} note={node.text ?? undefined}>
          When <Joined values={node.conditions} />: {node.stop}
        </Leaf>
      );
  }
}

/** A param's default as shown: a list joined with ", ". */
const shown = (d: ParamNode["default"]): string => (d === null ? "" : Array.isArray(d) ? d.join(", ") : String(d));

function Params({ params }: { params: ParamNode[] }) {
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-2 rounded-md border bg-background p-3">
      <div>Params</div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px]">
        {params.map((p) => (
          <Fragment key={p.name}>
            <Mono>{p.name}</Mono>
            <span className="text-muted-foreground">{shown(p.default)}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** A step file as written: its `do` tree as nested groups, then its params; or its first parse error above its text. */
export function StepView({ name, text }: { name: string; text: string }) {
  const source = useMemo(() => stepSource(parseDocument(text)), [text]);
  if ("error" in source) return <Broken error={source.error} text={text} />;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      {source.nodes.map((n) => (
        <Node key={n.path.join(".")} node={n} step={name} top={true} />
      ))}
      {source.params.length > 0 && <Params params={source.params} />}
    </div>
  );
}
