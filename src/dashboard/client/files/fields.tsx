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

/**
 * A labelled field: the label, the control, then an optional 12px muted note. A `group` holds several controls, each
 * labelled on its own, so it is a `role="group"` named by its label rather than a `<label>` of its first control.
 */
export function Row({ label, note, group = false, children }: { label: ReactNode; note?: ReactNode; group?: boolean; children: ReactNode }) {
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
  return group ? (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
      {content}
    </div>
  ) : (
    <label className="flex flex-col gap-1.5">{content}</label>
  );
}

/** A select of string options, each shown as itself unless `labels` names it. */
export function Choice({
  value,
  options,
  onChange,
  labels = {},
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(String(v ?? ""))}>
      <SelectTrigger className="w-full">
        <SelectValue>{(v: unknown) => labels[String(v)] ?? String(v ?? "")}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
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
  invalid = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  mono?: boolean;
  same?: (typed: string, value: string) => boolean;
  invalid?: boolean;
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
  if (multiline) return <Textarea className={cls} value={typed} placeholder={placeholder} aria-invalid={invalid || undefined} onChange={(e) => change(e.target.value)} />;
  return <Input className={cls} value={typed} placeholder={placeholder} aria-invalid={invalid || undefined} onChange={(e) => change(e.target.value)} />;
}

/** A checkbox with its label. */
export function Check({ checked, onChange, disabled, children }: { checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label className={disabled === true ? "flex items-center gap-2 text-muted-foreground" : "flex items-center gap-2"}>
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(on) => onChange(on === true)} />
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

/** A list typed comma-separated: its trimmed, non-empty items. */
export const commaList = (text: string): string[] =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");

/** Names as written: one as a scalar, several as a list; `undefined` for none. */
export const oneOrList = (names: string[]): string | string[] | undefined => (names.length === 0 ? undefined : names.length === 1 ? names[0] : names);
