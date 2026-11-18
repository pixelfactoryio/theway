import { isolateHistory, undo } from "@codemirror/commands"
import { EditorState, type Text } from "@codemirror/state"
import { arrayMove } from "@dnd-kit/sortable"
import { useQueryClient } from "@tanstack/react-query"
import { CircleAlertIcon, FileCodeIcon, FileTextIcon, Trash2Icon, XIcon } from "lucide-react"
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
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
import { ChangeDialogs } from "@/components/change-dialogs"
import { type DescriptionEdit, DescriptionField, IssuesAlert } from "@/components/change-header"
import { ChangePanel } from "@/components/change-panel"
import { ChangeTitle } from "@/components/change-header"
import { DOC_COLUMN, DocFrame } from "@/components/doc-frame"
import { type CodeLanguage, type CodeViewHandle, EditableCodeView, editableExtensions } from "@/components/code-view"
import { ConflictNotice, DraftStatus, SaveFailureNotice } from "@/components/draft-notices"
import { type AlertLine, ErrorStrip, STRIP } from "@/components/file-page"
import { MarkdownView } from "@/components/markdown"
import { LiveMarkdown } from "@/components/live-markdown"
import { formattingKeymap } from "@/components/markdown-editor"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { useSaveKey } from "@/components/step-prompt"
import { TaskList, type TaskListActions, type TaskRow } from "@/components/task-list"
import { Button } from "@/components/ui/button"
import { getJson } from "@/data/api"
import { apiPath, queryKeys, useWrites } from "@/data/queries"
import type { SyncedFile } from "@/drafts/draft-set"
import { useDrafts } from "@/drafts/use-drafts"
import { keptIds, oneLine } from "@/lib/change-edit"
import { type ChangeDetail, ChangeDetailSchema, type ChangeTab, changeTabs, shownTab } from "@/lib/changes"
import { lineSeparatorOf } from "@/lib/files"
import { leavesChange, to } from "@/lib/routes"

/** The files a change page holds a draft of: its Markdown files, then its `change.yaml` when it has one. */
function loadedFiles(data: ChangeDetail): SyncedFile[] {
  const files = data.files.map((f) => ({ name: f.name, text: f.text, version: f.version ?? "" }))
  return data.changeFile ? [...files, { name: CHANGE_FILE, ...data.changeFile }] : files
}

/** A file's language: YAML for `change.yaml`, Markdown for the others. */
const languageOf = (name: string): CodeLanguage => (name === CHANGE_FILE ? "yaml" : "markdown")

/**
 * A new state of `text` for the file `name`, with an empty undo history and the file's line separator; a Markdown
 * file's state also holds the formatting keys.
 */
function stateOf(name: string, text: string): EditorState {
  return EditorState.create({
    doc: text,
    extensions: [
      ...editableExtensions({ language: languageOf(name), name, separator: lineSeparatorOf(text) }),
      ...(languageOf(name) === "markdown" ? [formattingKeymap] : []),
    ],
  })
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

/**
 * The page of an active change: its header, its tabs and its panel, every part edited in place on a draft per file,
 * written only by Save.
 */
export function ActiveChange({ projectKey, data, tab }: { projectKey: string; data: ChangeDetail; tab?: string }) {
  const queryClient = useQueryClient()
  const writes = useWrites()
  const [, navigate] = useLocation()
  const [undoNote, setUndoNote] = useState<{ n: number; doc: Text } | null>(null)
  const files = useMemo(() => loadedFiles(data), [data])
  /** Every file in tab order: the Markdown files, then `change.yaml` at the Tasks tab's place. */
  const order = useMemo(() => files.map((f) => f.name), [files])
  // A save, a discard or a reload of `change.yaml` drops the undo notice.
  const clearUndo = (file: string) => {
    if (file === CHANGE_FILE) setUndoNote(null)
  }
  const {
    set: drafts,
    confirm,
    setConfirm,
    save,
    doDiscard,
    reload,
    doReload,
    saveAll,
  } = useDrafts({
    files,
    stateOf,
    put: (file, text, base) => writes.saveChangeFile(projectKey, data.id, file, text, base),
    /** Loads the change again and picks that file. */
    refetch: async (file) => {
      const path = apiPath.change(projectKey, data.id)
      let fresh: ChangeDetail
      try {
        fresh = await getJson(path, ChangeDetailSchema)
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
      const loaded = loadedFiles(fresh).find((f) => f.name === file)
      if (loaded === undefined) return "unknown file"
      queryClient.setQueryData(queryKeys.change(path), fresh)
      return loaded
    },
    errorCount: (file, text) => (file === CHANGE_FILE ? changeTextErrors(text).length : 0),
    leaves: (target) => leavesChange({ key: projectKey, id: data.id }, target),
    extraDirty: () => fieldDiffers(),
    onSaved: clearUndo,
    onDiscarded: clearUndo,
    onReloaded: clearUndo,
    order,
  })

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
  const [focus, setFocus] = useState<string | null>(null)
  const code = useRef<CodeViewHandle>(null)

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
    move: (from, to) => void runEdit({ kind: "move", from, to }, (list) => arrayMove(list, from, to)),
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
  const textView = current.file === null && yaml !== null
  const tabOf = (file: string): ChangeTab | undefined => tabs.find((t) => (t.file ?? CHANGE_FILE) === file)

  // The undo notice goes away at the next edit of the draft.
  const undoShown = undoNote !== null && yaml !== null && yaml.store.state.doc === undoNote.doc

  /** The leave dialog's Save: the open field applied, then every dirty draft written in tab order. */
  const saveAndLeave = async (proceed: () => void) => {
    setConfirm(null)
    const f = live.current.field
    if (f !== null && fieldDiffers() && !applyField(f, false)) return
    const failed = await saveAll()
    if (failed === null) {
      proceed()
      return
    }
    const t = tabOf(failed)
    if (t !== undefined) navigate(to.change(projectKey, data.id, t.slug))
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

  const dismiss = (onClick: () => void) => (
    <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onClick}>
      <XIcon aria-hidden="true" />
    </Button>
  )

  /** ⌘S / Ctrl+S: writes every file of the change with unsaved edits, `change.yaml` checked first. */
  const saveDirty = async () => {
    const f = live.current.field
    if (f !== null && fieldDiffers() && !applyField(f, false)) return
    for (const file of order) {
      if (drafts.isDirty(file) && !(await save(file, true))) return
    }
  }
  const saveRef = useRef(saveDirty)
  useLayoutEffect(() => {
    saveRef.current = saveDirty
  })
  useSaveKey(useCallback(() => void saveRef.current(), []))

  const notices = (
    <>
      {draft?.conflict ? <ConflictNotice onReload={() => reload(name)} /> : null}
      {draft !== null && draft.saveFailure !== null ? <SaveFailureNotice message={draft.saveFailure} /> : null}
      {textView ? <ErrorStrip lines={lines} /> : null}
    </>
  )

  const fileText = (file: string): string => drafts.text(file) ?? data.files.find((f) => f.name === file)?.text ?? ""
  const lineCount = (text: string): number =>
    text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0)

  // A Markdown file scrolls with the change's title above it, its document title; the editor grows to its text.
  let content: ReactNode
  if (current.file !== null) {
    content = (
      <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
        <ChangeTitle change={shown} />
        {draft !== null ? (
          <LiveMarkdown key={name} store={draft.store} name={name} className="h-auto" />
        ) : (
          <div className={`${DOC_COLUMN} py-6`}>
            <MarkdownView key={name} text={fileText(name)} onToggle={null} />
          </div>
        )}
      </div>
    )
  } else if (textView && yaml !== null) {
    content = (
      <div className="min-h-0 flex-1">
        <EditableCodeView ref={code} draft={yaml.store} errors={errors} />
      </div>
    )
  } else {
    content = (
      <div className="p-6">
        <IssuesAlert issues={shown.issues} className="max-w-[80ch]" />
      </div>
    )
  }

  const shownName = current.file ?? CHANGE_FILE
  const body = (
    <>
      {current.file === null ? <ChangeTitle change={shown} className="pb-4" /> : null}
      {notices}
      {content}
      <div className="flex h-7 shrink-0 items-center gap-2 border-t px-4 text-xs text-muted-foreground">
        <span className="font-mono">{shownName}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{lineCount(fileText(shownName))} lines</span>
        <span className="ml-auto">
          <DraftStatus dirty={drafts.isDirty(shownName)} saved={drafts.isSaved(shownName)} />
        </span>
      </div>
    </>
  )

  const taskPane = (
    <div className="flex flex-col">
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
      {yaml === null || !valid ? (
        <div className="flex flex-col gap-3 p-3">
          <IssuesAlert issues={shown.issues} />
          {yaml !== null ? (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => navigate(to.change(projectKey, data.id, "tasks"))}
            >
              <FileCodeIcon aria-hidden="true" />
              Open change.yaml
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="px-1 py-1">
          <TaskList
            rows={rows}
            field={field}
            actions={actions}
            focus={focus}
            onFocused={() => setFocus(null)}
            focusRow={setFocus}
          />
        </div>
      )}
    </div>
  )

  const descriptionPane = <DescriptionField description={description} edit={descriptionEdit} />

  return (
    <>
      <DocFrame
        title={data.id}
        label="Change files"
        page="change"
        value={current.slug}
        tabs={tabs.map((tab) => ({
          value: tab.slug,
          label: tab.file ?? CHANGE_FILE,
          href: to.change(projectKey, data.id, tab.slug),
          Icon: tab.file === null ? FileCodeIcon : FileTextIcon,
          dirty: drafts.isDirty(tab.file ?? CHANGE_FILE),
        }))}
        panelName="Change"
        panel={<ChangePanel projectKey={projectKey} change={shown} tasks={taskPane} description={descriptionPane} />}
      >
        {body}
      </DocFrame>
      <ChangeDialogs
        confirm={confirm}
        setConfirm={setConfirm}
        onDiscard={doDiscard}
        onReload={(file) => void doReload(file)}
        onLeaveSave={(proceed) => void saveAndLeave(proceed)}
      />
    </>
  )
}
