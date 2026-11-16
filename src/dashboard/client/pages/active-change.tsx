import { isolateHistory, undo } from "@codemirror/commands"
import type { Text } from "@codemirror/state"
import { useQueryClient } from "@tanstack/react-query"
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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { useLocation } from "wouter"

import {
  CHANGE_FILE,
  type ChangeEdit,
  changeStatus,
  changeTextErrors,
  checkChangeText,
  editedChangeText,
} from "../../../core/change-text"
import { DESCRIPTION_EMPTY, type OpenField, TASK_EMPTY } from "@/components/change-fields"
import { ChangeDialogs, type Confirm } from "@/components/change-dialogs"
import { ChangeDrafts, type Loaded } from "@/components/change-drafts"
import { type DescriptionEdit, Header, IssuesAlert, TabLabel, TaskCount } from "@/components/change-header"
import { ChangePanel } from "@/components/change-panel"
import { type CodeViewHandle, EditableCodeView } from "@/components/code-view"
import { type AlertLine, ErrorStrip, SavedStatus } from "@/components/file-page"
import { MarkdownView } from "@/components/markdown"
import { formattingKeymap, MarkdownEditor } from "@/components/markdown-editor"
import { PanelToggle, RecordBody, usePanelOpen } from "@/components/record-panel"
import { RecordTabs } from "@/components/record-tabs"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { TaskList, type TaskListActions, type TaskRow } from "@/components/task-list"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { keptIds, leavesChange, moved, oneLine, taskBox, taskBoxColumn, unsavedTitle } from "@/lib/change-edit"
import { type ChangeDetail, ChangeDetailSchema, type ChangeTab, changeTabs, shownTab } from "@/lib/changes"
import { setLeaveGuard } from "@/shell/guard"
import { getJson } from "@/shell/projects"
import { PageBody, TopBar, type TopBarItem } from "@/shell/top-bar"

/** A full-width strip under the tabs: no rounding, the bottom border only. */
const STRIP = "shrink-0 rounded-none border-x-0 border-t-0"

/** The files a change page holds a draft of: its Markdown files, then its `change.yaml` when it has one. */
function loadedFiles(data: ChangeDetail): ({ name: string } & Loaded)[] {
  const files = data.files.map((f) => ({ name: f.name, text: f.text, version: f.version ?? "" }))
  return data.changeFile ? [...files, { name: CHANGE_FILE, ...data.changeFile }] : files
}

let lastId = 0
/** A new client id of a task row. */
const newId = (): string => `task-${++lastId}`

/** The row ids of the tasks of a `change.yaml` text, for the draft's epoch. */
type RowIds = { text: string | null; epoch: number; ids: string[] }

/** Whether the open field `f` holds a text other than the draft's `tasks` and `description`, rows by `ids`. */
function differs(
  f: OpenField | null,
  tasks: readonly { text: string }[],
  description: string | null,
  ids: readonly string[],
): boolean {
  if (f === null) return false
  if (f.kind === "add" || f.kind === "below") return f.value !== ""
  if (f.kind === "description") return f.value !== description
  return f.value !== tasks[ids.indexOf(f.id)]?.text
}

/** The first source line of the block at the top of a reading view, 1 when none. */
function topLine(root: HTMLElement | null): number {
  if (root === null) return 1
  const top = root.getBoundingClientRect().top
  const block = [...root.querySelectorAll<HTMLElement>("[data-line]")].find(
    (b) => b.getBoundingClientRect().bottom > top + 1,
  )
  const n = Number(block?.dataset.line)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/**
 * The page of an active change: its header, its tabs and its panel, every part edited in place on a draft per file,
 * written only by Save.
 */
export function ActiveChange({
  projectKey,
  data,
  tab,
  crumbs,
}: {
  projectKey: string
  data: ChangeDetail
  tab?: string
  crumbs: TopBarItem[]
}) {
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
  // A string snapshot: equal by `Object.is` while the text is unchanged, so the memos below keep their values.
  const yamlText = useSyncExternalStore(drafts.subscribe, () => drafts.text(CHANGE_FILE))
  const check = useMemo(
    () => (yamlText === null ? { issues: data.issues } : checkChangeText(yamlText)),
    [yamlText, data.issues],
  )
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

  const [field, setField] = useState<OpenField | null>(null)

  // Row ids: made when the change loads and on Reload or Discard, carried through the list actions (set by `runEdit`
  // with the edit's text), kept by position after any other change of the draft.
  const epoch = yaml?.epoch ?? 0
  const [rowIds, setRowIds] = useState<RowIds>(() => ({ text: yamlText, epoch, ids: tasks.map(newId) }))
  let ids = rowIds.ids
  if (rowIds.epoch !== epoch || rowIds.text !== yamlText) {
    const previous = rowIds.ids
    const next = rowIds.epoch !== epoch ? tasks.map(newId) : keptIds(previous, tasks.length, newId)
    setRowIds({ text: yamlText, epoch, ids: next })
    // An open task field keeps its position; it closes when its position is gone.
    setField((f) => {
      if (f === null || (f.kind !== "task" && f.kind !== "below") || next.includes(f.id)) return f
      const i = previous.indexOf(f.id)
      return i >= 0 && i < next.length ? { ...f, id: next[i] as string } : null
    })
    ids = next
  }
  const rows: TaskRow[] = tasks.map((t, i) => ({ id: ids[i] as string, text: t.text, done: t.done }))

  const [actionError, setActionError] = useState<string | null>(null)
  const [undoNote, setUndoNote] = useState<{ n: number; doc: Text } | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [textOpen, setTextOpen] = useState(!valid)
  const [editing, setEditing] = useState<Record<string, number | undefined>>({})
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const code = useRef<CodeViewHandle>(null)
  const scrollRoot = useRef<HTMLDivElement>(null)

  // A draft that does not pass the check opens the text view, which stays until "Back to the list".
  if (!valid && yaml !== null && !textOpen) setTextOpen(true)

  // The latest field, tasks and row ids, for the event handlers.
  const live = useRef({ field, tasks, description, ids })
  useLayoutEffect(() => {
    live.current = { field, tasks, description, ids }
  })

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
    if (nextIds !== undefined) {
      // An open task field follows its task through a list action; it closes when its task is gone.
      const next = nextIds(live.current.ids)
      setRowIds({ text: r.text, epoch, ids: next })
      setField((f) => (f !== null && (f.kind === "task" || f.kind === "below") && !next.includes(f.id) ? null : f))
    }
    yaml.store.dispatch({
      changes: { from: 0, to: state.doc.length, insert: r.text },
      annotations: isolateHistory.of("full"),
    })
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
    if (
      !runEdit({ kind: "add", index: index + 1, text: f.value }, (list) => [
        ...list.slice(0, index + 1),
        id,
        ...list.slice(index + 1),
      ])
    )
      return false
    setField(null)
    if (enter) setFocus(id)
    return true
  }

  /** Opens a field, applying the open one first; false when that is refused (the open one stays). */
  const openField = (next: OpenField): boolean => {
    const f = live.current.field
    if (f !== null) {
      const same =
        f.kind === next.kind && (f.kind === "add" || f.kind === "description" || ("id" in next && f.id === next.id))
      if (same) return true
      if (!applyField(f, false)) return false
    }
    setField(next)
    return true
  }

  /** Whether the open field holds a text other than the draft's, for the event handlers. */
  const fieldDiffers = useCallback((): boolean => {
    const { field: f, tasks: t, description: d, ids: list } = live.current
    return differs(f, t, d, list)
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
      fresh = await getJson(api, ChangeDetailSchema)
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
    [projectKey, data.id, anyDirty, fieldDiffers],
  )
  const pending = anyDirty() || differs(field, tasks, description, ids)
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
    [errors],
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
            <Button
              variant="outline"
              size="xs"
              onClick={() => (drafts.isDirty(name) ? setConfirm({ kind: "reload", name }) : void reload(name))}
            >
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
        <div
          ref={scrollRoot}
          data-scroll-root
          className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]"
        >
          <div className="mx-auto w-full max-w-4xl px-4 py-6">
            <MarkdownView key={name} text={text} onToggle={draft === null ? null : toggleBox(name)} />
          </div>
        </div>
      )
  } else if (textView && yaml !== null) {
    content = (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden [scrollbar-gutter:stable_both-edges]">
        <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col border-x">
          <div className="min-h-0 flex-1">
            <EditableCodeView ref={code} draft={yaml.store} errors={errors} />
          </div>
        </div>
      </div>
    )
  } else {
    content = (
      <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
        <div className="mx-auto w-full max-w-4xl px-4 py-4">
          {yaml === null || !valid ? (
            <IssuesAlert issues={shown.issues} className="max-w-[80ch]" />
          ) : (
            <TaskList
              rows={rows}
              field={field}
              actions={actions}
              focus={focus}
              onFocused={() => setFocus(null)}
              focusRow={setFocus}
            />
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
      <TopBar
        items={crumbs}
        heading={false}
        actions={editingView ? undefined : <PanelToggle page="change" open={open} onOpenChange={setOpen} />}
      />
      <PageBody>
        {editingView ? (
          <div className="flex min-h-0 flex-1 flex-col">{body}</div>
        ) : (
          <RecordBody
            name="Change details"
            open={open}
            onOpenChange={setOpen}
            panel={<ChangePanel projectKey={projectKey} change={shown} />}
          >
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
