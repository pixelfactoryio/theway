import { type KeyboardEvent, useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

/** The text field open on a change page: at most one at a time. */
export type OpenField =
  | { kind: "task"; id: string; value: string; error: string | null }
  | { kind: "below"; id: string; value: string; error: string | null }
  | { kind: "add"; value: string }
  | { kind: "description"; value: string; error: string | null }

/** The refusals the page shows under a field. */
export const TASK_EMPTY = "A task needs a text."
export const DESCRIPTION_EMPTY = "A description is one non-empty line."

/**
 * The in-place field of a task's text (a `textarea`, Shift and Enter adding a line) or of the description (an `input`),
 * focused when it opens, with Apply and Cancel under it: Enter applies, Escape cancels; it stays open when it loses
 * focus. Its refusal shows under the control.
 */
export function TextField({
  multiline,
  label,
  value,
  error,
  onChange,
  onApply,
  onCancel,
}: {
  multiline: boolean
  label: string
  value: string
  error: string | null
  onChange: (value: string) => void
  onApply: () => void
  onCancel: () => void
}) {
  const control = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  useEffect(() => {
    const node = control.current
    if (node === null) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onApply()
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
  }
  const invalid = error !== null
  const common = {
    "aria-label": label,
    "aria-invalid": invalid || undefined,
    value,
    onKeyDown,
  }
  return (
    <Field data-invalid={invalid || undefined} className="gap-2">
      {multiline ? (
        <Textarea ref={control} {...common} onChange={(e) => onChange(e.target.value)} className="min-h-0" />
      ) : (
        <Input ref={control} {...common} onChange={(e) => onChange(e.target.value)} />
      )}
      {invalid ? <FieldError>{error}</FieldError> : null}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onApply}>
          Apply
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Field>
  )
}
