import { isolateHistory, undo } from "@codemirror/commands"
import type { Text } from "@codemirror/state"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckIcon,
  CircleAlertIcon,
  FileCodeIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { Link, useLocation } from "wouter"

import { CHANGE_FILE, type ChangeEdit, changeStatus, changeTextErrors, checkChangeText, editedChangeText } from "../../../core/change-text"
import { DESCRIPTION_EMPTY, type OpenField, TASK_EMPTY, TextField } from "@/components/change-fields"
import { ChangeDrafts, type Loaded } from "@/components/change-drafts"
import { type CodeViewHandle, EditableCodeView } from "@/components/code-view"
import { type AlertLine, ErrorStrip, SavedStatus } from "@/components/file-page"
import { MarkdownView } from "@/components/markdown"
import { formattingKeymap, MarkdownEditor } from "@/components/markdown-editor"
import { PanelToggle, RecordBody, usePanelOpen } from "@/components/record-panel"
import { RecordTabs } from "@/components/record-tabs"
import { Badge } from "@/components/reui/badge"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { StatusBadge, StatusIcon } from "@/components/status"
import { TaskList, type TaskListActions, type TaskRow } from "@/components/task-list"
import { CopyField, OneLine, TaskText } from "@/components/text"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { keptIds, leavesChange, moved, oneLine, taskBox, taskBoxColumn, unsavedTitle } from "@/lib/change-edit"
import { type ChangeDetail, type ChangeTab, changeTabs, nextTask, runCommand, type SeriesMember, shownTab } from "@/lib/changes"
import { saveWithErrors } from "@/lib/edit"
import { changesPath } from "@/lib/projects"
import { setLeaveGuard } from "@/shell/guard"
import { LoadError } from "@/shell/load-error"
import { getJson, useProjects } from "@/shell/projects"
import { PageBody, TopBar, type TopBarItem } from "@/shell/top-bar"

/** The errors of a `404` on a change's route. */
const UNKNOWN = ["unknown change", "unknown archive folder"]

/** A full-width strip under the tabs: no rounding, the bottom border only. */
const STRIP = "shrink-0 rounded-none border-x-0 border-t-0"

/** The issues of a change that cannot be read, in a destructive alert. */
function IssuesAlert({ issues, className }: { issues: string[]; className?: string }) {
  return (
    <Alert variant="destructive" className={className}>
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>This change cannot be read</AlertTitle>
      <AlertDescription>
        {issues.map((issue, i) => (
          <span key={i} className="font-mono text-xs">
            {issue}
          </span>
        ))}
      </AlertDescription>
    </Alert>
  )
}

/** The description's in-place editing: the open field, or how to open it. */
type DescriptionEdit = { field: (OpenField & { kind: "description" }) | null; open: () => void; change: (value: string) => void; apply: () => void; cancel: () => void }

function Header({ change, column, edit }: { change: ChangeDetail; column: boolean; edit: DescriptionEdit | null }) {
  const invalid = change.archived === null && change.issues.length > 0
  return (
    <div className={column ? "mx-auto w-full max-w-4xl shrink-0" : "w-full shrink-0"}>
      <div className="flex w-full flex-col gap-1 px-4 pt-6 pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="truncate text-lg font-semibold">{change.id}</h1>
          <StatusBadge status={change.status} />
        </div>
        {invalid ? (
          <IssuesAlert issues={change.issues} className="mt-2 max-w-[80ch]" />
        ) : change.description === null ? null : edit === null ? (
          <OneLine text={change.description} className="max-w-[80ch] text-sm text-muted-foreground" />
        ) : edit.field !== null ? (
          <div className="max-w-[80ch]">
            <TextField
              multiline={false}
              label="Description"
              value={edit.field.value}
              error={edit.field.error}
              onChange={edit.change}
              onApply={edit.apply}
              onCancel={edit.cancel}
            />
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Description: ${change.description}. Edit`}
            onClick={edit.open}
            className="-mx-1 max-w-[80ch] cursor-text rounded-sm px-1 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <OneLine text={change.description} className="text-sm text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  )
}

/** The tasks of an archived change, read-only, as member 02 built them. */
function Tasks({ change }: { change: ChangeDetail }) {
  if (change.issues.length > 0) return <IssuesAlert issues={change.issues} className="max-w-[80ch]" />
  return (
    <ol className="flex max-w-[80ch] flex-col">
      {change.tasks.map((task, i) => (
        <li key={i} className="flex items-start gap-3 border-b py-2 last:border-b-0">
          <Checkbox
            checked={task.done}
            readOnly
            aria-label={task.done ? `Task ${i + 1}, done` : `Task ${i + 1}`}
            className="mt-0.5"
          />
          <span className="w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{i + 1}.</span>
          <span className={task.done ? "text-sm whitespace-pre-line text-muted-foreground" : "text-sm whitespace-pre-line"}>
            <TaskText text={task.text} />
          </span>
        </li>
      ))}
    </ol>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

const memberHref = (key: string, m: { active: string | null; archived: string | null }): string =>
  m.active !== null ? `/${key}/changes/${m.active}?` : `/${key}/changes/archive/${m.archived}?`

/** One ordinal of the series list; the current change's row shows the current change itself. */
function SeriesRow({ projectKey, member, current }: { projectKey: string; member: SeriesMember; current: ChangeDetail | null }) {
  const shown: SeriesMember =
    current !== null
      ? {
          ordinal: member.ordinal,
          active: current.archived === null ? current.id : null,
          archived: current.archived === null ? null : `${current.archived}-${current.id}`,
          status: current.status,
          done: current.archived === null ? current.done : null,
          total: current.archived === null ? current.total : null,
        }
      : member
  const classes = "flex h-8 min-w-0 items-center gap-2 rounded-md px-2"
  if (shown.status === null || (shown.active === null && shown.archived === null)) {
    return (
      <li className={current !== null ? `${classes} bg-muted` : classes} aria-current={current !== null ? "true" : undefined}>
        <span className="text-muted-foreground tabular-nums">{member.ordinal}</span>
      </li>
    )
  }
  const id = shown.active ?? (shown.archived as string).slice(11)
  const right =
    shown.status === "archived" ? "Archived" : shown.status === "invalid" ? "–" : `${shown.done ?? 0}/${shown.total ?? 0}`
  return (
    <li className={current !== null ? `${classes} bg-muted` : classes} aria-current={current !== null ? "true" : undefined}>
      <StatusIcon status={shown.status} />
      <Link href={memberHref(projectKey, shown)} className="min-w-0 flex-1 underline-offset-4 hover:underline">
        <OneLine text={id} />
      </Link>
      <span className="shrink-0 text-muted-foreground tabular-nums">{right}</span>
    </li>
  )
}

/** The change page's right panel: Next task, Run, Series, Archived and Folder. */
function ChangePanel({ projectKey, change }: { projectKey: string; change: ChangeDetail }) {
  const archived = change.archived !== null
  const invalid = change.status === "invalid"
  const next = nextTask(change.tasks)
  const run = runCommand(change)
  const ordinal = /-(\d{2})$/.exec(change.id)?.[1]
  return (
    <div className="flex flex-col gap-4 p-4">
      <dl className="flex flex-col gap-4">
        {!archived && !invalid ? (
          <Row label="Next task">
            {next === null ? (
              "All tasks are done."
            ) : (
              <div className="flex gap-2">
                <span className="shrink-0 text-muted-foreground tabular-nums">{next.n}.</span>
                <span>
                  <TaskText text={next.text} />
                </span>
              </div>
            )}
          </Row>
        ) : null}
        {!archived ? (
          <Row label="Run">
            <CopyField value={run.command} name={run.name} />
          </Row>
        ) : null}
        {change.series !== null ? (
          <Row label="Series">
            <ol className="-mx-2 flex flex-col">
              {change.series.members.map((m) => (
                <SeriesRow key={m.ordinal} projectKey={projectKey} member={m} current={m.ordinal === ordinal ? change : null} />
              ))}
            </ol>
          </Row>
        ) : null}
        {archived ? (
          <Row label="Archived">
            <span className="tabular-nums">{change.archived}</span>
          </Row>
        ) : null}
        <Row label="Folder">
          <CopyField value={change.folder} name="the folder path" />
        </Row>
      </dl>
    </div>
  )
}

/** The unknown change, or unknown archive folder, state. */
function Unknown({ projectKey, name }: { projectKey: string; name: string }) {
  const projects = useProjects()
  const label = projects.data?.projects.find((p) => p.key === projectKey)?.label ?? projectKey
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          No change <code className="font-mono">{name}</code> in {label}
        </EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link href={changesPath(projectKey)} />}>
          Back to Changes
        </Button>
      </EmptyContent>
    </Empty>
  )
}

/** A tab's label with the unsaved dot after it. */
function TabLabel({ children, dirty }: { children: ReactNode; dirty: boolean }) {
  return (
    <>
      {children}
      {dirty ? <span role="img" aria-label="unsaved changes" className="size-2 shrink-0 rounded-full bg-foreground" /> : null}
    </>
  )
}

/** The Tasks tab's count: `done/total`, `–` while the change does not pass the check. */
function TaskCount({ change }: { change: ChangeDetail }) {
  return (
    <Badge variant="secondary" className="tabular-nums">
      {change.issues.length > 0 ? "–" : `${change.done}/${change.total}`}
    </Badge>
  )
}

/** The page of an archived change: member 02's read-only page. */
function ArchivedChange({ projectKey, data, tab, crumbs }: { projectKey: string; data: ChangeDetail; tab?: string; crumbs: TopBarItem[] }) {
  const [open, setOpen] = usePanelOpen()
  const base = `/${projectKey}/changes/archive/${data.archived}-${data.id}`
  const tabs = changeTabs(data.files)
  const current = shownTab(tabs, tab)
  const file = data.files.find((f) => f.name === current.file)
  return (
    <>
      <TopBar items={crumbs} heading={false} actions={<PanelToggle x="details" open={open} onOpenChange={setOpen} />} />
      <PageBody>
        <RecordBody name="Change details" open={open} onOpenChange={setOpen} panel={<ChangePanel projectKey={projectKey} change={data} />}>
          <Header change={data} column edit={null} />
          <RecordTabs
            column
            label="Change files"
            value={current.slug}
            tabs={tabs.map((t) => ({
              value: t.slug,
              href: `${base}/${encodeURIComponent(t.slug)}?`,
              label:
                t.file === null ? (
                  <>
                    Tasks
                    <TaskCount change={data} />
                  </>
                ) : (
                  t.label
                ),
            }))}
          />
          <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
            <div className={file !== undefined ? "mx-auto w-full max-w-4xl px-4 py-6" : "mx-auto w-full max-w-4xl px-4 py-4"}>
              {file !== undefined ? <MarkdownView key={file.name} text={file.text} /> : <Tasks change={data} />}
            </div>
          </div>
        </RecordBody>
      </PageBody>
    </>
  )
}

/** The files a change page holds a draft of: its Markdown files, then its `change.yaml` when it has one. */
function loadedFiles(data: ChangeDetail): ({ name: string } & Loaded)[] {
  const files = data.files.map((f) => ({ name: f.name, text: f.text, version: f.version ?? "" }))
  return data.changeFile ? [...files, { name: CHANGE_FILE, ...data.changeFile }] : files
}

/** The confirmation open on the page. */
type Confirm =
  | { kind: "discard"; name: string }
  | { kind: "reload"; name: string }
  | { kind: "errors"; n: number; answer: (yes: boolean) => void }
  | { kind: "leave"; proceed: () => void }
  | { kind: "done"; name: string }

let lastId = 0
/** A new client id of a task row. */
const newId = (): string => `task-${++lastId}`

/** The first source line of the block at the top of a reading view, 1 when none. */
function topLine(root: HTMLElement | null): number {
  if (root === null) return 1
  const top = root.getBoundingClientRect().top
  const block = [...root.querySelectorAll<HTMLElement>("[data-line]")].find((b) => b.getBoundingClientRect().bottom > top + 1)
  const n = Number(block?.dataset.line)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/**
 * The page of an active change: its header, its tabs and its panel, every part edited in place on a draft per file,
 * written only by Save.
 */
function ActiveChange({ projectKey, data, tab, crumbs }: { projectKey: string; data: ChangeDetail; tab?: string; crumbs: TopBarItem[] }) {
  const queryClient = useQueryClient()
  const [, navigate] = useLocation()
  const api = `/api/projects/${projectKey}/changes/${data.id}`
  const base = `/${projectKey}/changes/${data.id}`
  const [drafts] = useState(() => new ChangeDrafts(api, (name) => (name === CHANGE_FILE ? [] : [formattingKeymap])))
  const files = useMemo(() => loadedFiles(data), [data])
  if (drafts.drafts.size === 0 && files.length > 0) drafts.sync(files)
  useEffect(() => drafts.sync(files), [drafts, files])
  useSyncExternalStore(drafts.subscribe, drafts.getVersion)
  const [open, setOpen] = usePanelOpen()

  // Everything on the page reads the `change.yaml` draft.
  const yaml = drafts.get(CHANGE_FILE) ?? null
  const yamlText = yaml === null ? null : yaml.store.state.sliceDoc()
  const check = useMemo(() => (yamlText === null ? { issues: data.issues } : checkChangeText(yamlText)), [yamlText, data.issues])
  const errors = useMemo(() => (yamlText === null ? [] : changeTextErrors(yamlText)), [yamlText])
  const valid = "change" in check
  const tasks = valid ? check.change.tasks : []
  const description = valid ? check.change.description : null
  const shown: ChangeDetail = {
    ...data,
    status: changeStatus(check),
    description,
    tasks,
    done: tasks.filter((t) => t.done).length,
    total: tasks.length,
    issues: valid ? [] : check.issues,
  }

  // Row ids: made when the change loads and on Reload or Discard, carried through the list actions, kept by position
  // after any other change of the draft.
  const epoch = yaml?.epoch ?? 0
  const idsRef = useRef<{ text: string | null; epoch: number; ids: string[] } | null>(null)
  const listAction = useRef(false)
  if (idsRef.current === null || idsRef.current.epoch !== epoch) {
    idsRef.current = { text: yamlText, epoch, ids: tasks.map(newId) }
  } else if (idsRef.current.text !== yamlText) {
    idsRef.current = { text: yamlText, epoch, ids: keptIds(idsRef.current.ids, tasks.length, newId) }
  }
  const ids = idsRef.current.ids
  const rows: TaskRow[] = tasks.map((t, i) => ({ id: ids[i] as string, text: t.text, done: t.done }))

  const [field, setField] = useState<OpenField | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [undoNote, setUndoNote] = useState<{ n: number; doc: Text } | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [textOpen, setTextOpen] = useState(!valid)
  const [editing, setEditing] = useState<Record<string, number | undefined>>({})
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const code = useRef<CodeViewHandle>(null)
  const scrollRoot = useRef<HTMLDivElement>(null)

  // A draft that does not pass the check opens the text view, which stays until "Back to the list".
  useEffect(() => {
    if (!valid && yaml !== null) setTextOpen(true)
  }, [valid, yaml])

  // An open task field follows its task through the list actions and keeps its position after any other change;
  // it closes when its task, or its position, is gone.
  const prevIds = useRef<string[]>(ids)
  useEffect(() => {
    const previous = prevIds.current
    prevIds.current = ids
    const wasList = listAction.current
    listAction.current = false
    setField((f) => {
      if (f === null || (f.kind !== "task" && f.kind !== "below") || ids.includes(f.id)) return f
      if (wasList) return null
      const i = previous.indexOf(f.id)
      return i >= 0 && i < ids.length ? { ...f, id: ids[i] as string } : null
    })
  }, [ids])

  const live = useRef({ field, tasks, description, ids })
  live.current = { field, tasks, description, ids }

  /** Applies an edit to the draft as one undo step; a refusal shows in the action-error notice. */
  const runEdit = (edit: ChangeEdit, nextIds?: (ids: string[]) => string[]): boolean => {
    if (yaml === null) return false
    const state = yaml.store.state
    const text = state.sliceDoc()
    const r = editedChangeText(text, edit)
    if ("reason" in r) {
      setActionError(r.reason)
      return false
    }
    if (r.text === text) return true
    if (nextIds !== undefined && idsRef.current !== null) {
      idsRef.current = { text: r.text, epoch, ids: nextIds(idsRef.current.ids) }
      listAction.current = true
    }
    yaml.store.dispatch({ changes: { from: 0, to: state.doc.length, insert: r.text }, annotations: isolateHistory.of("full") })
    return true
  }

  /** Applies a field as Enter does; false when refused. `enter`: the user applied it (focus moves to a new row). */
  const applyField = (f: OpenField, enter: boolean): boolean => {
    const { ids: current } = live.current
    if (f.kind === "description") {
      const value = oneLine(f.value)
      if (value.trim() === "") {
        setField({ ...f, error: DESCRIPTION_EMPTY })
        return false
      }
      if (!runEdit({ kind: "description", text: value })) return false
      setField(null)
      return true
    }
    if (f.kind === "add") {
      if (f.value.trim() === "") {
        setField(null)
        return true
      }
      const id = newId()
      if (!runEdit({ kind: "add", index: current.length, text: f.value }, (list) => [...list, id])) return false
      setField(null)
      return true
    }
    const index = current.indexOf(f.id)
    if (index === -1) {
      setField(null)
      return true
    }
    if (f.value.trim() === "") {
      setField({ ...f, error: TASK_EMPTY })
      return false
    }
    if (f.kind === "task") {
      if (!runEdit({ kind: "text", index, text: f.value })) return false
      setField(null)
      return true
    }
    const id = newId()
    if (!runEdit({ kind: "add", index: index + 1, text: f.value }, (list) => [...list.slice(0, index + 1), id, ...list.slice(index + 1)])) return false
    setField(null)
    if (enter) setFocus(id)
    return true
  }

  /** Opens a field, applying the open one first; false when that is refused (the open one stays). */
  const openField = (next: OpenField): boolean => {
    const f = live.current.field
    if (f !== null) {
      const same = f.kind === next.kind && (f.kind === "add" || f.kind === "description" || ("id" in next && f.id === next.id))
      if (same) return true
      if (!applyField(f, false)) return false
    }
    setField(next)
    return true
  }

  /** Whether the open field holds a text other than the draft's. */
  const fieldDiffers = useCallback((): boolean => {
    const { field: f, tasks: t, description: d, ids: list } = live.current
    if (f === null) return false
    if (f.kind === "add" || f.kind === "below") return f.value !== ""
    if (f.kind === "description") return f.value !== d
    return f.value !== t[list.indexOf(f.id)]?.text
  }, [])

  const actions: TaskListActions = {
    toggle: (index, done) => void runEdit({ kind: "done", index, done }),
    move: (from, to) => void runEdit({ kind: "move", from, to }, (list) => moved(list, from, to)),
    remove: (index) => {
      if (runEdit({ kind: "remove", index }, (list) => list.filter((_, i) => i !== index)) && yaml !== null) {
        setUndoNote({ n: index + 1, doc: yaml.store.state.doc })
      }
    },
    open: openField,
    change: setField,
    apply: () => (field === null ? true : applyField(field, true)),
    cancel: () => setField(null),
  }

  const descriptionEdit: DescriptionEdit | null =
    yaml === null
      ? null
      : {
          field: field?.kind === "description" ? field : null,
          open: () => void openField({ kind: "description", value: description ?? "", error: null }),
          change: (value) => setField({ kind: "description", value, error: null }),
          apply: () => void (field !== null && applyField(field, true)),
          cancel: () => setField(null),
        }

  const tabs = changeTabs(data.files)
  const current = shownTab(tabs, tab)
  const name = current.file ?? CHANGE_FILE
  const draft = drafts.get(name) ?? null
  const startLine = current.file !== null ? editing[current.file] : undefined
  const editingView = startLine !== undefined && draft !== null
  const textView = current.file === null && yaml !== null && (textOpen || !valid)
  /** Every file in tab order: the Markdown files, then `change.yaml` at the Tasks tab's place. */
  const order = [...data.files.map((f) => f.name), ...(yaml !== null ? [CHANGE_FILE] : [])]
  const tabOf = (file: string): ChangeTab | undefined => tabs.find((t) => (t.file ?? CHANGE_FILE) === file)
  const anyDirty = useCallback((): boolean => [...drafts.drafts.keys()].some((n) => drafts.isDirty(n)), [drafts])

  // The undo notice goes away at the next edit of the draft.
  const undoShown = undoNote !== null && yaml !== null && yaml.store.state.doc === undoNote.doc

  const invalidate = () => {
    for (const key of [["changes", projectKey], ["projects"]]) void queryClient.invalidateQueries({ queryKey: key })
  }

  /** Writes a file's draft; `ask` asks "Save anyway" first when the `change.yaml` draft has errors. */
  const save = async (file: string, ask: boolean): Promise<boolean> => {
    if (ask && file === CHANGE_FILE) {
      const text = drafts.text(CHANGE_FILE)
      const n = text === null ? 0 : changeTextErrors(text).length
      if (n > 0 && !(await new Promise<boolean>((answer) => setConfirm({ kind: "errors", n, answer })))) return false
    }
    const ok = await drafts.save(file)
    if (ok && file === CHANGE_FILE) {
      setUndoNote(null)
      invalidate()
    }
    return ok
  }

  const discard = (file: string) => {
    drafts.discard(file)
    if (file === CHANGE_FILE) setUndoNote(null)
  }

  /** Loads the change again and drops that file's draft only. */
  const reload = async (file: string) => {
    let fresh: ChangeDetail
    try {
      fresh = await getJson<ChangeDetail>(api)
    } catch (e) {
      drafts.fail(file, e instanceof Error ? e.message : String(e))
      return
    }
    const loaded = loadedFiles(fresh).find((f) => f.name === file)
    if (loaded === undefined) {
      drafts.fail(file, "unknown file")
      return
    }
    drafts.reload(file, loaded)
    if (file === CHANGE_FILE) setUndoNote(null)
    queryClient.setQueryData(["change", api], fresh)
  }

  /** The leave dialog's Save: the open field applied, then every dirty draft written in tab order. */
  const saveAndLeave = async (proceed: () => void) => {
    setConfirm(null)
    const f = live.current.field
    if (f !== null && fieldDiffers() && !applyField(f, false)) return
    for (const file of order) {
      if (!drafts.isDirty(file)) continue
      if (!(await save(file, false))) {
        const t = tabOf(file)
        if (t !== undefined) navigate(`${base}/${encodeURIComponent(t.slug)}?`)
        return
      }
    }
    proceed()
  }

  // Leaving the change page asks first while a draft is dirty or an open field holds another text; closing or
  // reloading the browser tab gets the browser's prompt.
  useEffect(
    () =>
      setLeaveGuard({
        leaves: (target) => leavesChange({ key: projectKey, id: data.id }, target),
        isDirty: () => anyDirty() || fieldDiffers(),
        ask: (proceed) => setConfirm({ kind: "leave", proceed }),
      }),
    [projectKey, data.id, anyDirty, fieldDiffers]
  )
  const pending = anyDirty() || fieldDiffers()
  useEffect(() => {
    if (!pending) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    addEventListener("beforeunload", onBeforeUnload)
    return () => removeEventListener("beforeunload", onBeforeUnload)
  }, [pending])

  /** A Markdown checkbox of the reading view: the `[ ]` or `[x]` of its source line in the file's draft. */
  const toggleBox = (file: string) => (line: number, checked: boolean) => {
    const d = drafts.get(file)
    if (d === undefined) return
    const state = d.store.state
    if (line < 1 || line > state.doc.lines) return
    const l = state.doc.line(line)
    const at = taskBoxColumn(l.text)
    if (at === -1) return
    d.store.dispatch({ changes: { from: l.from + at, to: l.from + at + 3, insert: taskBox(checked) } })
  }

  const done = (file: string) => {
    if (drafts.isDirty(file)) setConfirm({ kind: "done", name: file })
    else setEditing((e) => ({ ...e, [file]: undefined }))
  }

  const lines = useMemo<AlertLine[]>(
    () =>
      errors.map((e) => {
        const line = e.line
        return line === null
          ? { text: e.text, onClick: null }
          : { text: `line ${line} · ${e.text}`, onClick: () => code.current?.goToLine(line) }
      }),
    [errors]
  )

  const endControl =
    current.file !== null ? (
      draft === null ? null : editingView ? (
        <Button variant="outline" onClick={() => done(name)}>
          <CheckIcon aria-hidden="true" />
          Done
        </Button>
      ) : (
        <Button variant="outline" onClick={() => setEditing((e) => ({ ...e, [name]: topLine(scrollRoot.current) }))}>
          <PencilIcon aria-hidden="true" />
          Edit
        </Button>
      )
    ) : yaml === null ? null : textView ? (
      valid ? (
        <Button variant="outline" onClick={() => setTextOpen(false)}>
          Back to the list
        </Button>
      ) : null
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More actions on the tasks" />}>
          <MoreHorizontalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setTextOpen(true)}>
            <FileCodeIcon aria-hidden="true" />
            Edit change.yaml as text
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

  const dismiss = (onClick: () => void) => (
    <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onClick}>
      <XIcon aria-hidden="true" />
    </Button>
  )

  const notices = (
    <>
      {draft?.conflict ? (
        <Alert variant="warning" className={STRIP}>
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>This file changed on disk since you opened it.</AlertTitle>
          <AlertAction>
            <Button variant="outline" size="xs" onClick={() => (drafts.isDirty(name) ? setConfirm({ kind: "reload", name }) : void reload(name))}>
              Reload
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {draft !== null && draft.saveFailure !== null ? (
        <Alert variant="destructive" className={STRIP}>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>The file could not be saved</AlertTitle>
          <AlertDescription>{draft.saveFailure}</AlertDescription>
        </Alert>
      ) : null}
      {actionError !== null ? (
        <Alert variant="destructive" className={STRIP}>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>The change could not be edited</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
          <AlertAction>{dismiss(() => setActionError(null))}</AlertAction>
        </Alert>
      ) : null}
      {undoShown ? (
        <Alert className={STRIP}>
          <Trash2Icon aria-hidden="true" />
          <AlertTitle>Task {undoNote.n} deleted.</AlertTitle>
          <AlertAction>
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                if (yaml !== null) undo({ state: yaml.store.state, dispatch: yaml.store.dispatch })
                setUndoNote(null)
              }}
            >
              Undo
            </Button>
            {dismiss(() => setUndoNote(null))}
          </AlertAction>
        </Alert>
      ) : null}
      {draft !== null && drafts.isDirty(name) ? (
        <Alert variant="info" className={STRIP}>
          <InfoIcon aria-hidden="true" />
          <AlertTitle>{unsavedTitle(name)}</AlertTitle>
          <AlertAction>
            <Button variant="outline" onClick={() => setConfirm({ kind: "discard", name })}>
              Discard
            </Button>
            <Button disabled={draft.saving} onClick={() => void save(name, true)}>
              Save
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {textView ? <ErrorStrip lines={lines} /> : null}
    </>
  )

  let content: ReactNode
  if (current.file !== null) {
    const text = draft?.store.state.sliceDoc() ?? data.files.find((f) => f.name === current.file)?.text ?? ""
    content =
      editingView && draft !== null ? (
        <MarkdownEditor key={name} store={draft.store} name={name} startLine={startLine} />
      ) : (
        <div ref={scrollRoot} data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-4 py-6">
            <MarkdownView key={name} text={text} onToggle={draft === null ? null : toggleBox(name)} />
          </div>
        </div>
      )
  } else if (textView && yaml !== null) {
    content = (
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col border-x">
        <div className="min-h-0 flex-1">
          <EditableCodeView ref={code} draft={yaml.store} errors={errors} />
        </div>
      </div>
    )
  } else {
    content = (
      <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-4">
          {yaml === null || !valid ? (
            <IssuesAlert issues={shown.issues} className="max-w-[80ch]" />
          ) : (
            <TaskList rows={rows} field={field} actions={actions} focus={focus} onFocused={() => setFocus(null)} focusRow={setFocus} />
          )}
        </div>
      </div>
    )
  }

  const body = (
    <>
      <Header change={shown} column={!editingView} edit={descriptionEdit} />
      <RecordTabs
        column={!editingView}
        label="Change files"
        value={current.slug}
        tabs={tabs.map((t) => ({
          value: t.slug,
          href: `${base}/${encodeURIComponent(t.slug)}?`,
          label: (
            <TabLabel dirty={drafts.isDirty(t.file ?? CHANGE_FILE)}>
              {t.file === null ? (
                <>
                  Tasks
                  <TaskCount change={shown} />
                </>
              ) : (
                t.label
              )}
            </TabLabel>
          ),
        }))}
        right={
          <>
            <SavedStatus saved={drafts.isSaved(name)} />
            {endControl}
          </>
        }
      />
      {notices}
      {content}
    </>
  )

  return (
    <>
      <TopBar items={crumbs} heading={false} actions={editingView ? undefined : <PanelToggle x="details" open={open} onOpenChange={setOpen} />} />
      <PageBody>
        {editingView ? (
          <div className="flex min-h-0 flex-1 flex-col">{body}</div>
        ) : (
          <RecordBody name="Change details" open={open} onOpenChange={setOpen} panel={<ChangePanel projectKey={projectKey} change={shown} />}>
            {body}
          </RecordBody>
        )}
      </PageBody>
      <ChangeDialogs
        confirm={confirm}
        setConfirm={setConfirm}
        onDiscard={discard}
        onReload={(file) => void reload(file)}
        onDoneSave={async (file) => {
          if (await save(file, false)) setEditing((e) => ({ ...e, [file]: undefined }))
        }}
        onDoneDiscard={(file) => {
          discard(file)
          setEditing((e) => ({ ...e, [file]: undefined }))
        }}
        onLeaveSave={(proceed) => void saveAndLeave(proceed)}
      />
    </>
  )
}

/** The page's confirmations: Discard, Reload, Save with errors, Done with unsaved changes, and leaving the page. */
function ChangeDialogs({
  confirm,
  setConfirm,
  onDiscard,
  onReload,
  onDoneSave,
  onDoneDiscard,
  onLeaveSave,
}: {
  confirm: Confirm | null
  setConfirm: (c: Confirm | null) => void
  onDiscard: (file: string) => void
  onReload: (file: string) => void
  onDoneSave: (file: string) => Promise<void>
  onDoneDiscard: (file: string) => void
  onLeaveSave: (proceed: () => void) => void
}) {
  const close = () => {
    if (confirm?.kind === "errors") confirm.answer(false)
    setConfirm(null)
  }
  return (
    <AlertDialog open={confirm !== null} onOpenChange={(next) => (next ? undefined : close())}>
      <AlertDialogContent>
        {confirm?.kind === "discard" || confirm?.kind === "reload" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirm(null)
                  if (confirm.kind === "discard") onDiscard(confirm.name)
                  else onReload(confirm.name)
                }}
              >
                {confirm.kind === "discard" ? "Discard" : "Reload"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : confirm?.kind === "errors" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{saveWithErrors(confirm.n)}</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  confirm.answer(true)
                  setConfirm(null)
                }}
              >
                Save anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : confirm?.kind === "done" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{unsavedTitle(confirm.name)}</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirm(null)
                  onDoneDiscard(confirm.name)
                }}
              >
                Discard
              </Button>
              <AlertDialogAction
                onClick={() => {
                  setConfirm(null)
                  void onDoneSave(confirm.name)
                }}
              >
                Save
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : confirm?.kind === "leave" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirm(null)
                  confirm.proceed()
                }}
              >
                Discard
              </Button>
              <AlertDialogAction onClick={() => onLeaveSave(confirm.proceed)}>Save</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * `#/<key>/changes/<id>[/<tab>]` and `#/<key>/changes/archive/<dir>[/<tab>]`: a change's header, its tabs (its Markdown
 * files, then Tasks) and its right panel; an active change is edited in place.
 */
export function ChangePage({ projectKey, id, dir, tab }: { projectKey: string; id?: string; dir?: string; tab?: string }) {
  const path =
    dir !== undefined ? `/api/projects/${projectKey}/changes/archive/${dir}` : `/api/projects/${projectKey}/changes/${id}`
  const change = useQuery({ queryKey: ["change", path], queryFn: () => getJson<ChangeDetail>(path) })

  const name = dir ?? id ?? ""
  const crumbs = (label: string): TopBarItem[] => [{ label: "Changes", href: changesPath(projectKey) }, { selector: true }, { label }]
  const fallback = dir !== undefined && /^\d{4}-\d{2}-\d{2}-.+/.test(dir) ? dir.slice(11) : name

  if (change.isPending) {
    return (
      <>
        <TopBar items={crumbs(fallback)} heading={false} />
        <PageBody>{null}</PageBody>
      </>
    )
  }
  if (change.isError) {
    const unknown = UNKNOWN.includes(change.error.message)
    return (
      <>
        <TopBar items={crumbs(unknown ? name : fallback)} heading={false} />
        <PageBody>
          {unknown ? (
            <Unknown projectKey={projectKey} name={name} />
          ) : (
            <LoadError what="this change" error={change.error} retry={() => void change.refetch()} className="m-4 w-auto" />
          )}
        </PageBody>
      </>
    )
  }

  const data = change.data
  if (data.archived !== null) return <ArchivedChange projectKey={projectKey} data={data} tab={tab} crumbs={crumbs(data.id)} />
  return <ActiveChange projectKey={projectKey} data={data} tab={tab} crumbs={crumbs(data.id)} />
}
