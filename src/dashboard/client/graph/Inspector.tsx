/** The right-hand inspector of the selected graph node. */
import { X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ParamValue } from "../../../core/schema";
import type { RenderedPrompt } from "../../types";
import type { Details, Param } from "./details";

const base = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
const shown = (v: ParamValue): string => (Array.isArray(v) ? v.join(", ") : String(v));

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Params({ params }: { params: Param[] }) {
  if (params.length === 0) return <p className="text-[12px] text-muted-foreground">No params.</p>;
  return (
    <table className="w-full text-left text-[12px]">
      <thead className="text-muted-foreground">
        <tr>
          <th className="py-1 pr-2 font-normal">Name</th>
          <th className="py-1 pr-2 font-normal">Value</th>
          <th className="py-1 font-normal">From</th>
        </tr>
      </thead>
      <tbody>
        {params.map((p) => (
          <tr key={p.name} className="border-t align-top">
            <td className="py-1 pr-2 font-mono">{p.name}</td>
            <td className="py-1 pr-2 font-mono">{shown(p.value)}</td>
            <td className="py-1 font-mono text-muted-foreground">{p.from}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Prompts({ paths, prompts }: { paths: string[]; prompts: Record<string, RenderedPrompt> }) {
  const [chosen, setChosen] = useState(0);
  const path = paths[chosen];
  const rendered = path === undefined ? undefined : prompts[path];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {paths.map((p, i) => (
          <Button key={p} variant={i === chosen ? "default" : "secondary"} size="sm" onClick={() => setChosen(i)}>
            {base(p)}
          </Button>
        ))}
      </div>
      {path !== undefined && (
        <div className="flex flex-col gap-2">
          {rendered === undefined || "error" in rendered ? (
            <p className="font-mono text-[12px] text-destructive">{rendered === undefined ? `no rendering of ${path}` : rendered.error}</p>
          ) : (
            // Rendered on the server with raw HTML escaped; the CSP is the second layer.
            <div className="markdown rounded-md border bg-white p-3" dangerouslySetInnerHTML={{ __html: rendered.html }} />
          )}
          <p className="font-mono text-[11px] break-all text-muted-foreground">{path}</p>
        </div>
      )}
    </div>
  );
}

function Body({ details, prompts }: { details: Details; prompts: Record<string, RenderedPrompt> }) {
  switch (details.kind) {
    case "agent":
      return (
        <Tabs defaultValue="prompt" className="gap-3">
          <TabsList>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="params">Params</TabsTrigger>
          </TabsList>
          <TabsContent value="prompt" className="flex flex-col gap-4">
            <Facts
              rows={[
                ["Returns", details.returns],
                ["Access", details.access],
                ["Model", details.model ?? "—, inline step"],
                ["Runs when", details.runsWhen.length === 0 ? "always" : details.runsWhen.join(", ")],
              ]}
            />
            <Prompts key={details.label} paths={details.prompts} prompts={prompts} />
          </TabsContent>
          <TabsContent value="params">
            <Params params={details.params} />
          </TabsContent>
        </Tabs>
      );
    case "step":
      return (
        <div className="flex flex-col gap-4">
          <p>{details.description}</p>
          <Facts
            rows={[
              ["File", <span className="font-mono text-[11px] break-all">{details.file}</span>],
              ["Agents", details.mode],
            ]}
          />
          <Params params={details.params} />
        </div>
      );
    case "gate":
      return (
        <div className="flex flex-col gap-2">
          <p className="font-medium">{details.question}</p>
          <p className="text-muted-foreground">Asked inline: Continue or Stop</p>
        </div>
      );
    case "stop":
      return <Facts rows={[["When", details.conditions.join(", ")], ["Then", details.text]]} />;
    case "loop":
      return (
        <Facts
          rows={[
            ["Max", details.max],
            ["Until", details.until.join(", ")],
            ["Exhausted", details.exhausted === "fail" ? "fail" : "continue"],
          ]}
        />
      );
    case "start":
      return <Facts rows={[["Input", details.input]]} />;
  }
}

const TITLE: Record<Details["kind"], string> = { agent: "Agent", step: "Step", gate: "Gate", stop: "Stop", loop: "Loop", start: "Start" };

function heading(d: Details): string {
  if (d.kind === "agent") return d.label;
  if (d.kind === "step" || d.kind === "gate") return d.id;
  if (d.kind === "stop") return d.text;
  return TITLE[d.kind];
}

/** A 360px panel with the selected node's details; Esc or × closes it. */
export function Inspector({ details, prompts, onClose }: { details: Details; prompts: Record<string, RenderedPrompt>; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l bg-white" aria-label="Inspector">
      <div className="flex h-11 items-center gap-2 border-b px-4">
        <Badge variant="secondary">{TITLE[details.kind]}</Badge>
        <span className="min-w-0 grow truncate font-medium">{heading(details)}</span>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <ScrollArea className="min-h-0 grow">
        <div className="p-4">
          <Body details={details} prompts={prompts} />
        </div>
      </ScrollArea>
    </aside>
  );
}
