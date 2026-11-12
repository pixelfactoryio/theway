/** The form controls of the settings column and the New dialog. */
import { cn } from "cn";
import { type ComponentProps, type ReactNode, useId, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** A text input, styled as the select triggers and the textarea. */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

/** A field's problems: the ID of its control and the messages shown under it. */
export type FieldProblem = { id: string; messages: string[] };

/** The props that tie a control to its problems: its ID, and `aria-invalid` and `aria-describedby` while it has any. */
export function invalidProps(p: FieldProblem | undefined): { id?: string; "aria-invalid"?: true; "aria-describedby"?: string } {
  if (p === undefined) return {};
  return p.messages.length === 0 ? { id: p.id } : { id: p.id, "aria-invalid": true, "aria-describedby": `${p.id}-error` };
}

/** A field's problem messages, in the destructive colour; `id` is the one `invalidProps` describes the control by. */
export function Problems({ problem }: { problem: FieldProblem | undefined }) {
  if (problem === undefined || problem.messages.length === 0) return null;
  return (
    <span id={`${problem.id}-error`} className="flex flex-col text-[12px] break-words text-destructive">
      {problem.messages.map((m) => (
        <span key={m}>{m}</span>
      ))}
    </span>
  );
}

/**
 * A labelled field: the label, the control, then an optional 12px muted note and the field's problems. A `group` holds
 * several controls, each labelled on its own, so it is a `role="group"` named by its label rather than a `<label>` of
 * its first control.
 */
export function Row({
  label,
  note,
  group = false,
  problem,
  children,
}: {
  label: ReactNode;
  note?: ReactNode;
  group?: boolean;
  problem?: FieldProblem;
  children: ReactNode;
}) {
  const id = useId();
  const content = (
    <>
      <span id={group ? id : undefined} className="font-medium">
        {label}
      </span>
      {children}
      {note !== undefined && note !== null && <span className="text-[12px] text-muted-foreground">{note}</span>}
    </>
  );
  return (
    <div className="flex flex-col gap-1.5">
      {group ? (
        <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
          {content}
        </div>
      ) : (
        <label className="flex flex-col gap-1.5">{content}</label>
      )}
      <Problems problem={problem} />
    </div>
  );
}

/** A select of string options, each shown as itself unless `labels` names it. */
export function Choice({
  value,
  options,
  onChange,
  labels = {},
  titles = {},
  problem,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  labels?: Record<string, string>;
  /** Each option's `title`, by value. */
  titles?: Record<string, string>;
  problem?: FieldProblem;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(String(v ?? ""))}>
      <SelectTrigger className="w-full" {...invalidProps(problem)}>
        <SelectValue>{(v: unknown) => labels[String(v)] ?? String(v ?? "")}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o} title={titles[o]}>
            {labels[o] ?? o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * A text field applied on every change. It keeps what is typed while the file's value is the one the typed text
 * gives (`same`), and shows the file's value when it changes otherwise, as on undo.
 */
export function TextField({
  value,
  onChange,
  placeholder,
  multiline = false,
  mono = false,
  same = (typed, v) => typed === v,
  problem,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  mono?: boolean;
  same?: (typed: string, value: string) => boolean;
  problem?: FieldProblem;
}) {
  const [typed, setTyped] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!same(typed, value)) setTyped(value);
  }
  const change = (v: string) => {
    setTyped(v);
    onChange(v);
  };
  const cls = mono ? "font-mono text-[13px]" : undefined;
  if (multiline) return <Textarea className={cls} value={typed} placeholder={placeholder} {...invalidProps(problem)} onChange={(e) => change(e.target.value)} />;
  return <Input className={cls} value={typed} placeholder={placeholder} {...invalidProps(problem)} onChange={(e) => change(e.target.value)} />;
}

/** A checkbox with its label. */
export function Check({
  checked,
  onChange,
  disabled,
  problem,
  children,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  problem?: FieldProblem;
  children: ReactNode;
}) {
  return (
    <label className={disabled === true ? "flex items-center gap-2 text-muted-foreground" : "flex items-center gap-2"}>
      <Checkbox checked={checked} disabled={disabled} {...invalidProps(problem)} onCheckedChange={(on) => onChange(on === true)} />
      {children}
    </label>
  );
}

/** A confirm: `title`, Cancel and the `action` button; `onConfirm` runs on the action. */
export function Confirm({
  open,
  title,
  action,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  action: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
