/** The editor's dialogs: the insert forms, New workflow and New step, and every confirm. */
import { type ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CONDITIONS, EXHAUSTED, NAME, TYPES } from "../../../core/schema";
import { type Item, itemLabel } from "./items";
import type { NewNode } from "./ops";

/** A labelled form row. */
export function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** A select of plain string options; `""` is the "none" option when `none` names it. */
export function Choice({
  id,
  value,
  options,
  onChange,
  none,
}: {
  id?: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  none?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(String(v ?? ""))}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue>{(v: unknown) => (v === "" || v === null || v === undefined ? (none ?? "") : String(v))}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {none !== undefined && <SelectItem value="">{none}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A checkbox per condition, in `CONDITIONS` order. */
export function Conditions({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {CONDITIONS.map((c) => (
        <label key={c} className="flex items-center gap-2 font-mono text-[12px]">
          <Checkbox checked={value.includes(c)} onCheckedChange={(on) => onChange(CONDITIONS.filter((x) => (x === c ? on === true : value.includes(x))))} />
          {c}
        </label>
      ))}
    </div>
  );
}

/** `max` as typed: an integer, else the text (a `${param}`). */
export const maxOf = (text: string): number | string => (/^[0-9]+$/.test(text.trim()) ? Number(text.trim()) : text.trim());

/** A `foreach` value as typed: a `${param}`, else the comma-separated names. */
export const namesOf = (text: string): string | string[] => {
  const t = text.trim();
  if (t.startsWith("${")) return t;
  return t
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
};

/** One condition as written: a single one as a string, several as a list. */
export const condsOf = (list: string[]): string | string[] => (list.length === 1 ? (list[0] as string) : list);

/** What an insert dialog gives back: a construct for a step, or a gate's question. */
export type Inserted = { node: NewNode } | { gate: string };

/** The dialog of a block inserted at a `+` point, with the fields it needs. */
export function InsertDialog({
  item,
  prompts,
  onCancel,
  onSubmit,
}: {
  item: Item | null;
  prompts: string[];
  onCancel: () => void;
  onSubmit: (v: Inserted) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [returns, setReturns] = useState("");
  const [max, setMax] = useState("");
  const [conds, setConds] = useState<string[]>([]);
  const [exhausted, setExhausted] = useState("continue");
  const [mode, setMode] = useState("do");
  const [block, setBlock] = useState("");
  const [value, setValue] = useState("");
  const [parallel, setParallel] = useState(false);
  const [question, setQuestion] = useState("");
  const type = item?.type;
  let result: Inserted | null = null;
  if (type === "agent" && prompt !== "" && returns !== "") result = { node: { agent: { prompt, returns } } };
  if (type === "loop" && max.trim() !== "" && conds.length > 0) {
    result = { node: { loop: { max: maxOf(max), until: condsOf(conds), exhausted, do: [] } } };
  }
  if (type === "when" && conds.length > 0) {
    const when = condsOf(conds);
    result = { node: mode === "fail" ? { when, fail: true } : mode === "block" ? { when, block: block.trim() === "" ? true : block } : { when, do: [] } };
  }
  if (type === "foreach" && value.trim() !== "") result = { node: { foreach: namesOf(value), ...(parallel ? { parallel: true } : {}), do: [] } };
  if (type === "gate" && question.trim() !== "") result = { gate: question.trim() };
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (result !== null) onSubmit(result);
          }}
        >
          <DialogHeader>
            <DialogTitle>Insert {item === null ? "" : itemLabel(item)}</DialogTitle>
          </DialogHeader>
          {type === "agent" && (
            <>
              <Row label="Prompt" htmlFor="ins-prompt">
                <Choice id="ins-prompt" value={prompt} options={prompts} onChange={setPrompt} none="Choose a prompt" />
              </Row>
              <Row label="Returns" htmlFor="ins-returns">
                <Choice id="ins-returns" value={returns} options={TYPES} onChange={setReturns} none="Choose a type" />
              </Row>
            </>
          )}
          {type === "loop" && (
            <>
              <Row label="Max" htmlFor="ins-max">
                <Input id="ins-max" value={max} onChange={(e) => setMax(e.target.value)} placeholder="2 or ${rounds}" />
              </Row>
              <Row label="Until">
                <Conditions value={conds} onChange={setConds} />
              </Row>
              <Row label="Exhausted" htmlFor="ins-exhausted">
                <Choice id="ins-exhausted" value={exhausted} options={EXHAUSTED} onChange={setExhausted} />
              </Row>
            </>
          )}
          {type === "when" && (
            <>
              <Row label="Conditions">
                <Conditions value={conds} onChange={setConds} />
              </Row>
              <Row label="Then" htmlFor="ins-mode">
                <Choice id="ins-mode" value={mode} options={["do", "fail", "block"]} onChange={setMode} />
              </Row>
              {mode === "block" && (
                <Row label="Block text" htmlFor="ins-block">
                  <Textarea id="ins-block" value={block} onChange={(e) => setBlock(e.target.value)} placeholder="Empty blocks without a text" />
                </Row>
              )}
            </>
          )}
          {type === "foreach" && (
            <>
              <Row label="Value" htmlFor="ins-value">
                <Input id="ins-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="${lenses} or a, b" />
              </Row>
              <label className="flex items-center gap-2">
                <Checkbox checked={parallel} onCheckedChange={(on) => setParallel(on === true)} />
                Parallel
              </label>
            </>
          )}
          {type === "gate" && (
            <Row label="Question" htmlFor="ins-question">
              <Input id="ins-question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ready to open the PR?" />
            </Row>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={result === null}>
              Insert
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Why `name` cannot name a new file, `null` when it can. */
export function nameProblem(name: string, taken: string[], step: boolean): string | null {
  if (name === "") return "A name is required.";
  if (!NAME.test(name)) return "Lowercase letters and digits in words separated by single hyphens.";
  if (step && name === "gate") return "gate is reserved.";
  if (taken.includes(name)) return "The project already has that name.";
  return null;
}

/** New workflow or New step: a name and a description, and for a step its first agent's prompt and result type. */
export function NewFileDialog({
  open,
  kind,
  taken,
  prompts = [],
  onCancel,
  onSubmit,
}: {
  open: boolean;
  kind: "workflow" | "step";
  taken: string[];
  prompts?: string[];
  onCancel: () => void;
  onSubmit: (v: { name: string; description: string; prompt: string; returns: string }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [returns, setReturns] = useState("");
  const step = kind === "step";
  const problem = nameProblem(name, taken, step);
  const ready = problem === null && description.trim() !== "" && (!step || (prompt !== "" && returns !== ""));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) onSubmit({ name, description: description.trim(), prompt, returns });
          }}
        >
          <DialogHeader>
            <DialogTitle>New {kind}</DialogTitle>
          </DialogHeader>
          <Row label="Name" htmlFor="new-name">
            <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={name !== "" && problem !== null} />
            {name !== "" && problem !== null && <p className="text-[12px] text-destructive">{problem}</p>}
          </Row>
          <Row label="Description" htmlFor="new-description">
            <Textarea id="new-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Row>
          {step && (
            <>
              <Row label="First agent's prompt" htmlFor="new-prompt">
                <Choice id="new-prompt" value={prompt} options={prompts} onChange={setPrompt} none="Choose a prompt" />
              </Row>
              <Row label="Returns" htmlFor="new-returns">
                <Choice id="new-returns" value={returns} options={TYPES} onChange={setReturns} none="Choose a type" />
              </Row>
            </>
          )}
          <p className="text-[12px] text-muted-foreground">Saved to this project only.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A confirm: what it asks, and the action that goes on. */
export type ConfirmAsk = { title: string; text: string; action: string; onConfirm: () => void };

/** The editor's confirm dialog, open while `ask` is set. */
export function Confirm({ ask, onClose }: { ask: ConfirmAsk | null; onClose: () => void }) {
  return (
    <AlertDialog open={ask !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{ask?.title}</AlertDialogTitle>
          <AlertDialogDescription>{ask?.text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              const go = ask?.onConfirm;
              onClose();
              go?.();
            }}
          >
            {ask?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
