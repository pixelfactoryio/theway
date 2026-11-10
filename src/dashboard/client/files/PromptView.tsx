/** The prompt page's drawing: its header errors, its inputs and its instructions, and its Used by panel. */
import { Link } from "wouter";
import { Badge } from "@/components/reui/badge";
import { fileHref } from "@/lib/api";
import type { FileUse, PromptResolved } from "../../types";
import { Card, ModelBadge, Panel, shownLine } from "./WorkflowView";

/** The title badges of a prompt: "step prompt" for a step prompt, then its header's model. */
export function PromptBadges({ step, resolved }: { step: boolean; resolved: PromptResolved }) {
  return (
    <>
      {step && <Badge variant="primary-light">step prompt</Badge>}
      {resolved.header?.model != null && <ModelBadge model={resolved.header.model} />}
    </>
  );
}

/** The header errors of a prompt a step or an on-fail uses; nothing for a prompt only used as a value or not at all. */
export function HeaderErrors({ resolved, usedBy }: { resolved: PromptResolved; usedBy: FileUse[] }) {
  if (!usedBy.some((u) => u.use !== "value") || resolved.headerErrors.length === 0) return null;
  return (
    <div className="flex flex-col">
      {resolved.headerErrors.map((l) => (
        <p key={l} className="text-destructive break-words">
          {shownLine(l, [])}
        </p>
      ))}
    </div>
  );
}

/** The centre of a prompt page: its Inputs, when its header declares any, then its Instructions. */
export function PromptView({ resolved }: { resolved: PromptResolved }) {
  const inputs = Object.entries(resolved.header?.inputs ?? {});
  return (
    <div className="flex w-full max-w-[720px] flex-col gap-3">
      {inputs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Inputs</h2>
          <Card className="divide-y divide-divider-row p-0">
            {inputs.map(([name, input]) => (
              <div key={name} className="flex flex-col gap-0.5 px-4 py-2.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[13px]">{name}</span>
                  {input.required ? (
                    <span className="text-[12px] text-warning-foreground">required</span>
                  ) : (
                    <>
                      <span className="text-[12px] text-muted-foreground">optional</span>
                      {input.default !== null && <span className="text-[12px] text-muted-foreground">default: {input.default}</span>}
                    </>
                  )}
                </div>
                <span className="text-muted-foreground">{input.description}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Instructions</h2>
        <Card>
          {/* Rendered on the server with raw HTML escaped; the CSP is the second layer. */}
          <div className="markdown" dangerouslySetInnerHTML={{ __html: resolved.html }} />
        </Card>
      </section>
    </div>
  );
}

const USE = { step: "step", "on-fail": "on fail of step", value: "value in step" } as const;

/** The Used by panel: each workflow that names the prompt, with how and in which step. */
export function UsedBy({ usedBy }: { usedBy: FileUse[] }) {
  return (
    <Panel title="Used by">
      {usedBy.length === 0 ? (
        <span className="text-muted-foreground">no workflow</span>
      ) : (
        usedBy.map((u) => (
          <div key={`${u.scope}/${u.key ?? ""}/${u.name}/${u.step}/${u.use}`} className="flex flex-wrap items-center gap-1.5">
            <Link href={fileHref({ scope: u.scope, key: u.key, kind: "workflows", name: u.name })} className="font-mono text-[13px] hover:underline">
              {u.name}
            </Link>
            {u.scope === "project" && <span className="text-[12px] text-muted-foreground">{u.label ?? u.key}</span>}
            <Badge variant="secondary">
              {USE[u.use]} {u.step}
            </Badge>
          </div>
        ))
      )}
    </Panel>
  );
}
