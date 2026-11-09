import { Fragment, type ReactNode } from "react";
import { Link } from "wouter";
import { fileHref, useFiles } from "@/lib/api";
import type { StepEntry } from "../../../core/schema";
import type { FileDetail } from "../../types";
import { summary } from "./summary";

/** A card of the centre: at most 400px wide, on the background colour. */
export function Card({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-[400px] rounded-md border bg-background px-3 py-2.5">{children}</div>;
}

/** A file that cannot be drawn: its error line above its text. */
export function Broken({ error, text }: { error: string; text: string }) {
  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-destructive">{error}</p>
      <pre className="overflow-x-auto rounded-md border bg-background p-3 font-mono text-[13px]">{text}</pre>
    </div>
  );
}

function StepCard({ entry }: { entry: StepEntry }) {
  const files = useFiles();
  const item = files.data?.steps.find((f) => f.path === entry.file);
  const { note, lines } = summary(entry);
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        {item === undefined ? (
          <span className="font-mono text-[13px]">{entry.id}</span>
        ) : (
          <Link href={fileHref(item)} className="font-mono text-[13px] hover:underline">
            {entry.id}
          </Link>
        )}
        {note !== null && <span className="text-[12px] text-muted-foreground">{note}</span>}
      </div>
      {lines.map((l, i) => (
        <div key={i} className={`flex items-baseline justify-between gap-3 border-t border-divider-row py-1 ${i === 0 ? "mt-1.5" : ""}`}>
          <span>{l.names}</span>
          {l.note !== null && <span className="shrink-0 text-[12px] text-muted-foreground">{l.note}</span>}
        </div>
      ))}
    </Card>
  );
}

/** The resolved workflow: one card per entry, joined by a line; or the line that stops it above its text. */
export function WorkflowView({ detail }: { detail: FileDetail }) {
  const { resolved } = detail;
  if ("error" in resolved) return <Broken error={resolved.error} text={detail.text} />;
  if (!("doc" in resolved)) return null;
  return (
    <div className="flex w-full flex-col items-center">
      {resolved.doc.steps.map((entry, i) => (
        <Fragment key={`${i}:${entry.id}`}>
          {i > 0 && <span className="block h-4 w-px bg-muted-foreground" />}
          {"gate" in entry ? (
            <Card>
              <div className="flex items-baseline justify-between gap-3">
                <span>Gate</span>
                <span className="text-muted-foreground">{entry.gate}</span>
              </div>
            </Card>
          ) : (
            <StepCard entry={entry} />
          )}
        </Fragment>
      ))}
    </div>
  );
}
