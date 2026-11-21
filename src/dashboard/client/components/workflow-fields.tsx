import { isolateHistory } from "@codemirror/commands"
import { cn } from "cn"
import { type ReactNode, useEffect, useRef, useState } from "react"

import { StatusMark } from "@/components/status"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { DraftStore } from "@/drafts/draft-store"
import { keyError, RUNS_ON_ORDER, type TextValue } from "@/lib/workflow-form"
import { keyLabel } from "@/lib/workflow"
import type { Place } from "@/lib/workflow-place"

/** How an edit joins the undo history: its own step (`full`), the first keystroke of a field (`before`), or typing (`null`). */
export type HistoryMode = "full" | "before" | null

/** An edit of the draft's text; true when it changed the draft. */
export type Write = (edit: (text: string) => string, mode?: HistoryMode) => boolean

/**
 * Applies an edit to the draft: its text read as `state.sliceDoc()`, the new text dispatched as one whole-text
 * replacement with its history annotation. An edit that gives the text back dispatches nothing.
 */
export function applyEdit(store: DraftStore, edit: (text: string) => string, mode: HistoryMode = "full"): boolean {
  const state = store.state
  const text = state.sliceDoc()
  const next = edit(text)
  if (next === text) return false
  store.dispatch({
    changes: { from: 0, to: state.doc.length, insert: next },
    annotations: mode === null ? [] : [isolateHistory.of(mode)],
  })
  return true
}

/** The FieldDescription of a control that cannot show its value. */
export const ON_YAML = "Edit this value on the YAML tab."

/** The value of a select's default option (the workflow's, the prompt's, None). */
const DEFAULT = "\u0000default"

/** Each line under its field, in red, in the code font. */
export function Errors({ lines }: { lines: readonly string[] | undefined }) {
  if (lines === undefined || lines.length === 0) return null
  return (
    <>
      {lines.map((line, i) => (
        <FieldError key={i} className="font-mono text-xs font-normal text-destructive-foreground">
          {line}
        </FieldError>
      ))}
    </>
  )
}

/**
 * The lines of a card that no field shows (a step that is not a map, a key the panel has no field for): one row each
 * on a light rule, the Invalid mark then the line in the code font, in red.
 */
export function CardLines({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null
  return (
    <ul role="alert" className="flex flex-col">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-2 border-t border-rule px-3 py-2">
          <StatusMark status="invalid" className="mt-0.5" />
          <span className="min-w-0 font-mono text-xs wrap-break-word text-destructive-foreground">{line}</span>
        </li>
      ))}
    </ul>
  )
}

/** A field's note under its control (an input's description, why a control is disabled): `text-xs` (14px), the secondary ink. */
export function FieldNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

/**
 * A text control bound to the draft: while it has focus it shows what was typed, else the draft's value (and again
 * the draft's value whenever the draft changes by another way). The first keystroke after it takes focus starts a new
 * undo step; the next ones join it as typing does. `null` disables it.
 */
export function DraftText({
  id,
  value,
  onWrite,
  multiline = false,
  rows,
  label,
  className,
  disabled = false,
  invalid = false,
}: {
  id: string
  value: TextValue
  onWrite: (value: string, mode: HistoryMode) => boolean
  multiline?: boolean
  rows?: number
  label?: string
  className?: string
  disabled?: boolean
  invalid?: boolean
}) {
  const [typed, setTyped] = useState<string | null>(null)
  const fresh = useRef(false)
  const self = useRef(false)
  // A change of the draft by another way shows the draft's value, even while focused.
  useEffect(() => {
    if (self.current) {
      self.current = false
      return
    }
    setTyped((t) => (t === null ? null : (value ?? "")))
  }, [value])
  const shown = typed ?? value ?? ""
  const props = {
    id,
    value: shown,
    disabled: disabled || value === null,
    "aria-label": label,
    "aria-invalid": invalid || undefined,
    className,
    onFocus: () => {
      setTyped(value ?? "")
      fresh.current = true
    },
    onBlur: () => setTyped(null),
    onChange: (e: { target: { value: string } }) => {
      const next = e.target.value
      setTyped(next)
      const mode = fresh.current ? "before" : null
      fresh.current = false
      if (onWrite(next, mode)) self.current = true
    },
  }
  return multiline ? (
    <Textarea rows={rows} {...props} className={cn(CONTROL, "min-h-0 py-1", className)} />
  ) : (
    <Input {...props} className={cn(CONTROL, "h-7", className)} />
  )
}

/** A control of a card's row: 6px corners, 8px across, the interface's `text-sm` (15px) at every width. */
const CONTROL = "rounded-md px-2 text-sm md:text-sm"

/** A select option. */
export type Option = { value: string; label: string }

/**
 * A select of `options`, the default option (`first`, value `null`) first when given. A value the file holds that the
 * select does not offer shows first, marked "invalid". With no default option, `null` shows the placeholder.
 */
export function ChoiceSelect({
  id,
  value,
  first,
  options,
  placeholder,
  onChange,
  className,
  disabled = false,
}: {
  id: string
  value: string | null
  first?: string
  options: readonly Option[]
  placeholder?: string
  onChange: (value: string | null) => void
  className?: string
  disabled?: boolean
}) {
  const known = (v: string) => options.some((o) => o.value === v)
  const items: Option[] = [
    ...(value !== null && !known(value) ? [{ value, label: `${value} (invalid)` }] : []),
    ...(first !== undefined ? [{ value: DEFAULT, label: first }] : []),
    ...options,
  ]
  const selected = value ?? (first !== undefined ? DEFAULT : null)
  return (
    <Select
      items={items}
      value={selected}
      disabled={disabled}
      onValueChange={(v) => {
        if (v === null || v === selected) return
        if (v === DEFAULT) onChange(null)
        else if (known(v as string)) onChange(v as string)
      }}
    >
      <SelectTrigger id={id} size="sm" className={cn("w-full rounded-md", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * A row of a workflow panel's card, as a property card's row: on a light rule, its label at the left in a 92px column
 * in the secondary ink (`label`, or its YAML key as a name: `runs-on` is Runs on), level with a 28px control; its value
 * or control (`children`) at the right, then the lines of `errors` under it. `orientation` is kept for the callers: a
 * switch stands at the start of the value column like any control.
 */
export function PanelField({
  yamlKey,
  label,
  htmlFor,
  errors,
  children,
}: {
  yamlKey: string
  /** The label in place of the key's name (an input's name, in mono). */
  label?: ReactNode
  htmlFor?: string
  orientation?: "vertical" | "horizontal"
  errors?: readonly string[]
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] items-start gap-x-2 border-t border-rule px-3 py-2">
      <Label
        htmlFor={htmlFor}
        className="block min-w-0 text-sm leading-7 font-normal wrap-break-word text-muted-foreground"
      >
        {label ?? keyLabel(yamlKey)}
      </Label>
      <div className="flex min-h-7 min-w-0 flex-col justify-center gap-1">
        {children}
        <Errors lines={errors} />
      </div>
    </div>
  )
}

export const RUNS_ON_OPTIONS: Option[] = RUNS_ON_ORDER.map((r) => ({ value: r, label: r }))

/** The lines of one panel by the field they name, and those its alert shows. */
export function byField(places: readonly { line: string; place: Place }[], shown: (field: string) => boolean) {
  const fields = new Map<string, string[]>()
  const alert: string[] = []
  for (const { line, place } of places) {
    if (place.panel === "none") continue
    if (place.field === "alert" || !shown(place.field)) alert.push(line)
    else fields.set(place.field, [...(fields.get(place.field) ?? []), line])
  }
  return { fields, alert }
}

/**
 * A key field (an input's name, the matrix Key): it writes only a non-empty name no sibling has; otherwise the file
 * keeps the last written name, and `onTyped` lets the caller show why.
 */
export function KeyText({
  id,
  value,
  siblings,
  label,
  onTyped,
  onWrite,
  className,
}: {
  id: string
  value: TextValue
  siblings: readonly string[]
  label?: string
  onTyped: (typed: string | null) => void
  onWrite: (value: string, mode: HistoryMode) => boolean
  className?: string
}) {
  const [typed, setTyped] = useState<string | null>(null)
  const fresh = useRef(false)
  const self = useRef(false)
  useEffect(() => {
    if (self.current) {
      self.current = false
      return
    }
    setTyped((t) => (t === null ? null : (value ?? "")))
    onTyped(null)
  }, [value, onTyped])
  const err = typed === null ? null : keyError(typed, siblings)
  return (
    <Input
      id={id}
      aria-label={label}
      aria-invalid={err !== null || undefined}
      className={cn(CONTROL, "h-7 font-mono text-xs md:text-xs", className)}
      value={typed ?? value ?? ""}
      disabled={value === null}
      onFocus={() => {
        setTyped(value ?? "")
        fresh.current = true
      }}
      onBlur={() => {
        setTyped(null)
        onTyped(null)
      }}
      onChange={(e) => {
        const next = e.target.value
        setTyped(next)
        onTyped(next)
        if (keyError(next, siblings) !== null) return
        const mode = fresh.current ? "before" : null
        fresh.current = false
        if (onWrite(next, mode)) self.current = true
      }}
    />
  )
}
