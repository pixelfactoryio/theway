/**
 * The summary of a resolved step entry, as the workflow view draws it on the step's card: a header note and one line
 * per item. Pure: no DOM, no React.
 */
import type { AgentOut, Out, StepEntry } from "../../../core/schema";

/** One line of a step card: the names on the left, a note on the right (`null` for none). */
export type Line = { names: string; note: string | null };

/** A step card's summary: the header note (`null` for none) and its lines. */
export type Summary = { note: string | null; lines: Line[] };

/** The names of every agent of a list, in order, at any depth. */
function agentNames(list: Out[]): string[] {
  return list.flatMap((out): string[] => {
    if ("agent" in out) return [out.agent.name];
    if ("parallel" in out) return out.parallel.map((p) => p.agent.name);
    if ("loop" in out) return agentNames(out.loop.do);
    if ("do" in out) return agentNames(out.do);
    return [];
  });
}

/** An agent's note: `commits` or `pushes` by its access, none otherwise. */
const accessNote = (a: AgentOut): string | null => (a.access === "commit" ? "commits" : a.access === "push" ? "pushes" : null);

/** The lines of a list: one per item; a loop gives its children's lines. */
function lines(list: Out[]): Line[] {
  return list.flatMap((out): Line[] => {
    if ("agent" in out) return [{ names: out.agent.name, note: accessNote(out.agent) }];
    if ("parallel" in out) return [{ names: out.parallel.map((p) => p.agent.name).join(", "), note: "in parallel" }];
    if ("loop" in out) return lines(out.loop.do);
    const note = `when ${out.when.join(", ")}`;
    if ("do" in out) return [{ names: agentNames(out.do).join(", "), note }];
    return [{ names: "fail" in out ? "fail" : "block", note }];
  });
}

/** The summary of a resolved step: the first top-level loop's `up to <max>, until <until>`, and the lines of its `do`. */
export function summary(entry: Pick<StepEntry, "do">): Summary {
  const loop = entry.do.find((out) => "loop" in out);
  const note = loop !== undefined && "loop" in loop ? `up to ${loop.loop.max}, until ${loop.loop.until.join(", ")}` : null;
  return { note, lines: lines(entry.do) };
}
