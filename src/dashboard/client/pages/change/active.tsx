import { undo } from "@codemirror/commands"
import { EditorState } from "@codemirror/state"
import { useQueryClient } from "@tanstack/react-query"
import { FileCodeIcon, Trash2Icon, XIcon } from "lucide-react"
import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react"
import { useLocation } from "wouter"

import { CHANGE_FILE, changeStatus, changeTextErrors, checkChangeText } from "../../../../core/change-text"
import { ChangeDialogs } from "@/components/change-dialogs"
import { ChangeHeading, DescriptionField, UNREADABLE } from "@/components/change-header"
import { ChangePanel, ChangeStatus } from "@/components/change-panel"
import { CodeTab } from "@/components/code-tab"
import { DocFrame } from "@/components/doc-frame"
import { DocFooter, LineCount } from "@/components/doc-footer"
import { DocTab } from "@/components/doc-tab"
import { type CodeLanguage, type CodeViewHandle, editableExtensions } from "@/components/code-view"
import { ConflictNotice, DraftStatus, SaveFailureNotice } from "@/components/draft-notices"
import { ErrorStrip, LinesAlert } from "@/components/file-page"
import { LiveMarkdown } from "@/components/live-markdown"
import { MarkdownView } from "@/components/markdown-view"
import { formattingKeymap } from "@/components/markdown-editor"
import { useSaveKey } from "@/components/step-prompt"
import { TaskList } from "@/components/task-list"
import { Button } from "@/components/ui/button"
import { useTaskFields } from "@/components/use-task-fields"
import { getJson } from "@/data/api"
import { apiPath, queryKeys, useLabel, useWrites } from "@/data/queries"
import type { SyncedFile } from "@/drafts/draft-set"
import { useDrafts } from "@/drafts/use-drafts"
import { alertLines } from "@/lib/alert-lines"
import {
  type ChangeDetail,
  ChangeDetailSchema,
  type ChangeTab,
  changeTabs,
  ownDescription,
  shownTab,
} from "@/lib/changes"
import { lineSeparatorOf } from "@/lib/files"
import { leavesChange, to } from "@/lib/routes"
import { ProjectMark } from "@/shell/project-mark"
import { StateNotice } from "@/shell/state"

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

  /** ⌘S / Ctrl+S: writes every file of the change with unsaved edits, `change.yaml` checked first. */
  const saveDirty = async () => {
    const f = currentField()
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
  const status = <DraftStatus dirty={drafts.isDirty(name)} saved={drafts.isSaved(name)} />
  const footer = <DocFooter file={name} details={[<LineCount text={fileText(name)} />]} status={status} />

  let body: ReactNode
  if (current.file !== null) {
    // A Markdown file scrolls under the change's title; the editor grows to its text.
    body = (
      <DocTab footer={footer}>
        {draft !== null ? (
          <LiveMarkdown
            key={name}
            store={draft.store}
            name={name}
            title={ownDescription(description, data.id)}
            className="h-auto"
          />
        ) : (
          <MarkdownView key={name} text={fileText(name)} name={name} title={ownDescription(description, data.id)} />
        )}
      </DocTab>
    )
  } else if (yaml !== null) {
    body = <CodeTab ref={code} draft={yaml.store} errors={errors} file={name} status={status} />
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
                  if (yaml !== null) undo({ state: yaml.store.state, dispatch: yaml.store.dispatch })
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

  const descriptionPane = <DescriptionField description={description} id={shown.id} edit={descriptionEdit} />

  return (
    <>
      <DocFrame
        title={data.id}
        mono
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
        status={<ChangeStatus change={shown} />}
        notices={notices}
        heading={<ChangeHeading change={shown} />}
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
