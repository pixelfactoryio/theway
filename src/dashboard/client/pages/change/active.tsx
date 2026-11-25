import { undo } from "@codemirror/commands"
import { EditorState } from "@codemirror/state"
import { useQueryClient } from "@tanstack/react-query"
import { FileCodeIcon, Trash2Icon, XIcon } from "lucide-react"
import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react"
import { useLocation } from "wouter"

import { CHANGE_FILE, changeStatus, changeTextErrors, checkChangeText } from "../../../../core/change-text"
import { ChangeDialogs } from "@/components/change-dialogs"
import { ChangeHeading, DescriptionField, descriptionInDetails, UNREADABLE } from "@/components/change-header"
import { ChangePanel, ChangeStatus } from "@/components/change-panel"
import { CodeTab } from "@/components/code-tab"
import { DocFrame } from "@/components/doc-frame"
import { DocFooter, LineCount } from "@/components/doc-footer"
import { DocTab } from "@/components/doc-tab"
import { DocumentEditor } from "@/components/document-editor"
import { type CodeLanguage, type CodeViewHandle, codeExtensions, runEditing } from "@/components/code-view"
import { ConflictNotice, SaveBar, SaveFailureNotice } from "@/components/draft-notices"
import { EditControl, useEditMode } from "@/components/edit-mode"
import { ErrorStrip, LinesAlert } from "@/components/file-page"
import { MarkdownView } from "@/components/markdown-view"
import { useSaveKey } from "@/components/step-prompt"
import { TaskList } from "@/components/task-list"
import { Button } from "@/components/ui/button"
import { useTaskFields } from "@/components/use-task-fields"
import { getJson } from "@/data/api"
import { apiPath, queryKeys, useLabel, useWrites } from "@/data/queries"
import type { SyncedFile } from "@/drafts/draft-set"
import { useDrafts } from "@/drafts/use-drafts"
import { alertLines } from "@/lib/alert-lines"
import { changeCommands } from "@/lib/copy-targets"
import {
  type ChangeDetail,
  ChangeDetailSchema,
  type ChangeTab,
  changeTabs,
  ownDescription,
  shownTab,
} from "@/lib/changes"
import { type FileError, lineSeparatorOf } from "@/lib/files"
import { leavesChange, to } from "@/lib/routes"
import { ProjectMark } from "@/shell/project-mark"
import { StateNotice } from "@/shell/state"

/** The files a change page holds a draft of: its Markdown files, then its `change.yaml` when it has one. */
function loadedFiles(data: ChangeDetail): SyncedFile[] {
  const files = data.files.map((f) => ({ name: f.name, text: f.text, version: f.version ?? "" }))
  return data.changeFile ? [...files, { name: CHANGE_FILE, ...data.changeFile }] : files
}

/** A Markdown file's errors in Source: none (only `change.yaml` is checked), one array so the view marks them once. */
const NO_ERRORS: readonly FileError[] = []

/** A file's language: YAML for `change.yaml`, Markdown for the others. */
const languageOf = (name: string): CodeLanguage => (name === CHANGE_FILE ? "yaml" : "markdown")

/**
 * A new state of `text` for the file `name`: the code set in its reading half (a page opens reading), an empty undo
 * history and the file's line separator. A Markdown file's code set holds the formatting keys in its editing half.
 */
function stateOf(name: string, text: string): EditorState {
  return EditorState.create({
    doc: text,
    extensions: codeExtensions({ language: languageOf(name), name, separator: lineSeparatorOf(text) }),
  })
}

/**
 * The page of an active change: its header, its tabs and its panel, every part edited in place on a draft per file,
 * written only by Save.
 */
export function ActiveChange({ projectKey, data, tab }: { projectKey: string; data: ChangeDetail; tab?: string }) {
  const queryClient = useQueryClient()
  const writes = useWrites()
  const project = useLabel()(projectKey)
  const [, navigate] = useLocation()
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
    discard,
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

  const {
    field,
    rows,
    focus,
    setFocus,
    actionError,
    setActionError,
    undoNote,
    setUndoNote,
    applyField,
    fieldDiffers,
    currentField,
    actions,
    descriptionEdit,
    closeField,
  } = useTaskFields({ yaml, yamlText, tasks, description })
  const code = useRef<CodeViewHandle>(null)

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
    const f = currentField()
    if (f !== null && fieldDiffers() && !applyField(f, false)) return
    const failed = await saveAll()
    if (failed === null) {
      proceed()
      return
    }
    const t = tabOf(failed)
    if (t !== undefined) navigate(to.change(projectKey, data.id, t.slug))
  }

  const lines = useMemo(() => alertLines(errors, (line) => () => code.current?.goToLine(line)), [errors])

  const dismiss = (onClick: () => void) => (
    <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onClick}>
      <XIcon aria-hidden="true" />
    </Button>
  )

  /**
   * ⌘S / Ctrl+S and Save: writes every file of the change with unsaved edits, `change.yaml` checked first; true once
   * every one is written, false when a save failed or "Save anyway" was refused.
   */
  const saveDirty = async (): Promise<boolean> => {
    const f = currentField()
    if (f !== null && fieldDiffers() && !applyField(f, false)) return false
    for (const file of order) {
      if (drafts.isDirty(file) && !(await save(file, true))) return false
    }
    return true
  }
  const saveRef = useRef(saveDirty)
  useLayoutEffect(() => {
    saveRef.current = saveDirty
  })
  useSaveKey(useCallback(() => void saveRef.current(), []))

  // The page's mode: on a Markdown file's tab and on `change.yaml`'s, each a view of a draft.
  const mode = useEditMode({
    available: draft !== null,
    store: draft?.store ?? null,
    setConfirm,
    // An open field with a refused text holds a change of `change.yaml` the draft does not.
    dirtyCount: () => order.filter((file) => drafts.isDirty(file) || (file === CHANGE_FILE && fieldDiffers())).length,
    save: () => saveRef.current(),
    discardAll: () => {
      closeField()
      for (const file of order) if (drafts.isDirty(file)) doDiscard(file)
    },
  })

  const notices = (
    <>
      {draft?.conflict ? <ConflictNotice onReload={() => reload(name)} /> : null}
      {draft !== null && draft.saveFailure !== null ? <SaveFailureNotice message={draft.saveFailure} /> : null}
      {textView ? <ErrorStrip lines={lines} /> : null}
    </>
  )

  const fileText = (file: string): string => drafts.text(file) ?? data.files.find((f) => f.name === file)?.text ?? ""
  // Discard asks first (`ChangeDialogs`), then drops the shown file's draft, as on a prompt's or a workflow's page;
  // Save is ⌘S.
  const status = (
    <SaveBar
      dirty={drafts.isDirty(name)}
      saved={drafts.isSaved(name)}
      editing={mode.editing}
      onDiscard={() => discard(name)}
      onSave={() => void saveRef.current()}
    />
  )
  const footer = <DocFooter file={name} details={[<LineCount text={fileText(name)} />]} status={status} />

  let body: ReactNode
  if (current.file !== null) {
    // A Markdown file scrolls under the change's title; the editor grows to its text.
    body =
      draft !== null ? (
        <DocumentEditor
          store={draft.store}
          name={name}
          language="markdown"
          title={ownDescription(description, data.id)}
          mode={mode}
          errors={NO_ERRORS}
          file={name}
          saveBar={status}
        />
      ) : (
        <DocTab footer={footer}>
          <MarkdownView key={name} text={fileText(name)} name={name} title={ownDescription(description, data.id)} />
        </DocTab>
      )
  } else if (yaml !== null) {
    body = <CodeTab ref={code} draft={yaml.store} errors={errors} file={name} status={status} mode={mode} />
  } else {
    // No `change.yaml` to edit: the title states the reasons, and nothing stands in place of the code.
    body = <DocTab footer={footer}>{null}</DocTab>
  }

  const taskPane = (
    <div className="flex flex-col">
      {actionError !== null ? (
        <StateNotice
          tone="error"
          place="card"
          title="The change could not be edited"
          action={dismiss(() => setActionError(null))}
        >
          {actionError}
        </StateNotice>
      ) : null}
      {undoShown ? (
        <StateNotice
          tone="info"
          place="card"
          icon={<Trash2Icon aria-hidden="true" />}
          title={`Task ${undoNote.n} deleted`}
          action={
            <>
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  // Through `runEditing`: the history commands refuse a reading state.
                  if (yaml !== null) runEditing(yaml.store, undo)
                  setUndoNote(null)
                }}
              >
                Undo
              </Button>
              {dismiss(() => setUndoNote(null))}
            </>
          }
        />
      ) : null}
      {yaml === null || !valid ? (
        <div className="flex flex-col">
          <LinesAlert lines={shown.issues} title={UNREADABLE} place="card" />
          {yaml !== null ? (
            <Button
              variant="outline"
              size="sm"
              className="m-3 self-start"
              onClick={() => navigate(to.change(projectKey, data.id, "tasks"))}
            >
              <FileCodeIcon aria-hidden="true" />
              Open change.yaml
            </Button>
          ) : null}
        </div>
      ) : (
        <div>
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

  // The description is the page's title, edited there; Details names it only while the title does not show it.
  const descriptionPane = descriptionInDetails(shown, descriptionEdit) ? (
    <DescriptionField description={description} id={shown.id} edit={descriptionEdit} />
  ) : null

  return (
    <>
      <DocFrame
        title={data.id}
        mono
        copy={{ value: data.id, what: "the change ID" }}
        run={changeCommands(data.id)}
        icon={<ProjectMark label={project} className="size-4" />}
        parents={[{ label: project, href: to.project(projectKey) }]}
        label="Change files"
        value={current.slug}
        tabs={tabs.map((tab) => ({
          value: tab.slug,
          label: tab.file ?? CHANGE_FILE,
          href: to.change(projectKey, data.id, tab.slug),
          dirty: drafts.isDirty(tab.file ?? CHANGE_FILE),
        }))}
        tabActions={<EditControl mode={mode} />}
        status={<ChangeStatus change={shown} />}
        notices={notices}
        heading={<ChangeHeading change={shown} edit={descriptionEdit} />}
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
        done={mode.answers}
      />
    </>
  )
}
