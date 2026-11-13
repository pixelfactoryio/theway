import { useQueryClient } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useLocation } from "wouter"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { emptyText, NAME } from "@/lib/edit"
import { type FileBody, fileApi, filePath, rowId } from "@/lib/files"
import { sendJson } from "@/shell/api"
import { useLabel, usePrompts, useWorkflows } from "@/shell/files"
import { getJson, useCurrentKey, useProjects } from "@/shell/projects"

type Kind = "workflows" | "prompts"

const TITLE: Record<Kind, string> = { workflows: "New workflow", prompts: "New prompt" }

const BAD_NAME = "Use lowercase letters and digits, in words joined by single hyphens."
const TAKEN = "A file of this name exists there already."
const NO_DESCRIPTION = "Say what it does."
const REPLACES = "Replaces the global file of this name for this project."

/** The fields of the dialog; a new form each time it opens. */
function NewFileForm({ kind, close }: { kind: Kind; close: () => void }) {
  const queryClient = useQueryClient()
  const [, navigate] = useLocation()
  const label = useLabel()
  const projects = useProjects()
  const current = useCurrentKey()
  const workflows = useWorkflows()
  const prompts = usePrompts()
  const files: { name: string; project: string | null }[] =
    (kind === "workflows" ? workflows.data?.workflows : prompts.data?.prompts) ?? []
  const listed = projects.data?.projects ?? []
  // The current project first, then the others in the projects list's order.
  const ordered = [...listed.filter((p) => p.key === current), ...listed.filter((p) => p.key !== current)]

  const [name, setName] = useState("")
  const [scope, setScope] = useState<"all" | "one">("all")
  const [project, setProject] = useState<string | null>(current)
  const [from, setFrom] = useState("empty")
  const [description, setDescription] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const target = scope === "one" ? (project ?? ordered[0]?.key ?? null) : null
  const nameError = !NAME.test(name)
    ? BAD_NAME
    : conflict || files.some((f) => f.name === name && f.project === target)
      ? TAKEN
      : null
  const descriptionError = from === "empty" && description.trim() === "" ? NO_DESCRIPTION : null
  const replaces = scope === "one" && NAME.test(name) && files.some((f) => f.name === name && f.project === null)
  const showName = submitted && nameError !== null
  const showDescription = submitted && descriptionError !== null

  const fromItems = [
    { value: "empty", label: "Empty" },
    ...files.map((f) => ({
      value: rowId(f),
      label: f.project === null ? `Copy of ${f.name}` : `Copy of ${f.name} (${label(f.project)} only)`,
    })),
  ]
  const projectItems = ordered.map((p) => ({ value: p.key, label: p.label }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (nameError !== null || descriptionError !== null || busy) return
    setBusy(true)
    setFailure(null)
    let text: string
    if (from === "empty") text = emptyText(kind, description)
    else {
      const source = files.find((f) => rowId(f) === from)
      try {
        text = (await getJson<FileBody>(fileApi(kind, source?.project ?? null, source?.name ?? ""))).text
      } catch (e) {
        setFailure((e as Error).message)
        setBusy(false)
        return
      }
    }
    const res = await sendJson("PUT", fileApi(kind, target, name), { text, base: null })
    setBusy(false)
    if (res.status === 200) {
      for (const key of [["workflows"], ["prompts"]]) void queryClient.invalidateQueries({ queryKey: key })
      close()
      navigate(`${filePath(kind, target, name)}?`)
      return
    }
    if (res.status === 409) setConflict(true)
    else setFailure(res.error !== "" ? res.error : `${res.status}`)
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <FieldGroup>
        <Field data-invalid={showName || undefined}>
          <FieldLabel htmlFor="new-file-name">Name</FieldLabel>
          <Input
            id="new-file-name"
            autoComplete="off"
            value={name}
            aria-invalid={showName || undefined}
            onChange={(e) => {
              setName(e.target.value)
              setConflict(false)
            }}
          />
          {showName ? <FieldError>{nameError}</FieldError> : replaces ? <FieldDescription>{REPLACES}</FieldDescription> : null}
        </Field>
        <FieldSet>
          <FieldLegend variant="label">Applies to</FieldLegend>
          <RadioGroup
            value={scope}
            onValueChange={(v) => {
              setScope(v as "all" | "one")
              setConflict(false)
            }}
          >
            <Field orientation="horizontal">
              <RadioGroupItem value="all" id="new-file-all" />
              <FieldLabel htmlFor="new-file-all" className="font-normal">
                All projects
              </FieldLabel>
            </Field>
            <Field orientation="horizontal" data-disabled={listed.length === 0 || undefined}>
              <RadioGroupItem value="one" id="new-file-one" disabled={listed.length === 0} />
              <FieldLabel htmlFor="new-file-one" className="font-normal">
                One project
              </FieldLabel>
            </Field>
          </RadioGroup>
          {scope === "one" ? (
            <Select items={projectItems} value={target} onValueChange={(v) => {
                setProject(v as string)
                setConflict(false)
              }}
            >
              <SelectTrigger className="w-full" aria-label="Project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projectItems.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </FieldSet>
        <Field>
          <FieldLabel htmlFor="new-file-from">Start from</FieldLabel>
          <Select items={fromItems} value={from} onValueChange={(v) => setFrom(v as string)}>
            <SelectTrigger id="new-file-from" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fromItems.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {from === "empty" ? (
          <Field data-invalid={showDescription || undefined}>
            <FieldLabel htmlFor="new-file-description">Description</FieldLabel>
            <Input
              id="new-file-description"
              value={description}
              aria-invalid={showDescription || undefined}
              onChange={(e) => setDescription(e.target.value)}
            />
            {showDescription ? <FieldError>{descriptionError}</FieldError> : null}
          </Field>
        ) : null}
      </FieldGroup>
      {failure !== null ? <FieldError className="mt-4">{failure}</FieldError> : null}
      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="submit">Create</Button>
      </DialogFooter>
    </form>
  )
}

/**
 * "New workflow" or "New prompt": the button (primary in the top bar, `outline` in the table's empty state) and its
 * dialog. Closing the dialog resets every field.
 */
export function NewFileButton({ kind, variant = "default" }: { kind: Kind; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false)
  const [instance, setInstance] = useState(0)
  const close = () => {
    setOpen(false)
    setInstance((n) => n + 1)
  }
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        {TITLE[kind]}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{TITLE[kind]}</DialogTitle>
          </DialogHeader>
          <NewFileForm key={instance} kind={kind} close={close} />
        </DialogContent>
      </Dialog>
    </>
  )
}
