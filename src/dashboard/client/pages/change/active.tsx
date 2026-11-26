import { EditorState } from "@codemirror/state"
import { useQueryClient } from "@tanstack/react-query"
import { FileCodeIcon } from "lucide-react"
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useLocation } from "wouter"

import { CHANGE_FILE, changeTextErrors } from "../../../../core/change-text"
import { ChangeDialogs } from "@/components/change-dialogs"
import { ChangeDescription, ChangeHeading, UNREADABLE } from "@/components/change-header"
import { ChangePanel, ChangeStatus } from "@/components/change-panel"
import { type CodeLanguage, type CodeViewHandle, editableExtensions } from "@/components/code-view"
import { DocFrame } from "@/components/doc-frame"
import { ConflictNotice, SaveFailureNotice } from "@/components/draft-notices"
import { ErrorStrip, LinesAlert } from "@/components/file-page"
import { FileEditor, type FileView, SaveControls } from "@/components/file-editor"
import { formattingKeymap } from "@/components/markdown-editor"
import { useSaveKey } from "@/components/step-prompt"
import { TaskList } from "@/components/task-list"
import { Button } from "@/components/ui/button"
import { getJson } from "@/data/api"
import { apiPath, queryKeys, useLabel, useWrites } from "@/data/queries"
import type { SyncedFile } from "@/drafts/draft-set"
import { useDrafts } from "@/drafts/use-drafts"
import { alertLines } from "@/lib/alert-lines"
import { changeCommands } from "@/lib/copy-targets"
import { type ChangeDetail, ChangeDetailSchema, type ChangeTab, changeTabs, shownTab } from "@/lib/changes"
import { type FileError, lineSeparatorOf } from "@/lib/files"
import { leavesChange, to } from "@/lib/routes"
import { ProjectMark } from "@/shell/project-mark"

/** The files a change page holds a draft of: its Markdown files, then its `change.yaml` when it has one. */
function loadedFiles(data: ChangeDetail): SyncedFile[] {
  const files = data.files.map((f) => ({ name: f.name, text: f.text, version: f.version ?? "" }))
  return data.changeFile ? [...files, { name: CHANGE_FILE, ...data.changeFile }] : files
}

/** A Markdown file's marks: none, one array, so the editor's marks are not set again on every render. */
const NO_ERRORS: readonly FileError[] = []

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
 * The tasks in the panel, read-only (they change in `change.yaml`): the saved list, or the reasons the change cannot
 * be read with a way to its `change.yaml`.
 */
function PanelTasks({ change, openYaml }: { change: ChangeDetail; openYaml: (() => void) | null }) {
  if (change.issues.length === 0) return <TaskList markNext rows={change.tasks} />
  return (
    <div className="flex flex-col">
      <LinesAlert lines={change.issues} title={UNREADABLE} place="card" />
      {openYaml !== null ? (
        <Button variant="outline" size="sm" className="m-3 self-start" onClick={openYaml}>
          <FileCodeIcon aria-hidden="true" />
          Open change.yaml
        </Button>
      ) : null}
    </div>
  )
}

/**
 * The page of an active change: each of its files edited whole in the file editor, on a draft per file written only
 * by Save; the panel at the right shows the change as saved, read-only.
 */
export function ActiveChange({ projectKey, data, tab }: { projectKey: string; data: ChangeDetail; tab?: string }) {
  const queryClient = useQueryClient()
  const writes = useWrites()
  const project = useLabel()(projectKey)
  const [, navigate] = useLocation()
  const files = useMemo(() => loadedFiles(data), [data])
  /** Every file in tab order: the Markdown files, then `change.yaml`. */
  const order = useMemo(() => files.map((f) => f.name), [files])
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
    order,
  })

  // The `change.yaml` draft's errors, marked on its lines as it is typed.
  const yamlText = useSyncExternalStore(drafts.subscribe, () => drafts.text(CHANGE_FILE))
  const errors = useMemo(() => (yamlText === null ? [] : changeTextErrors(yamlText)), [yamlText])
  const code = useRef<CodeViewHandle>(null)
  const [view, setView] = useState<FileView>("source")

  const tabs = changeTabs(data.files)
  const current = shownTab(tabs, tab)
  const name = current.file ?? CHANGE_FILE
  const draft = drafts.get(name) ?? null
  const language = languageOf(name)
  const tabOf = (file: string): ChangeTab | undefined => tabs.find((t) => (t.file ?? CHANGE_FILE) === file)

  /** The leave dialog's Save: every dirty draft written in tab order. */
  const saveAndLeave = async (proceed: () => void) => {
    setConfirm(null)
    const failed = await saveAll()
    if (failed === null) {
      proceed()
      return
    }
    const t = tabOf(failed)
    if (t !== undefined) navigate(to.change(projectKey, data.id, t.slug))
  }

  const lines = useMemo(() => alertLines(errors, (line) => () => code.current?.goToLine(line)), [errors])

  /** Save and ⌘S / Ctrl+S: writes every file of the change with unsaved edits, in tab order. */
  const saveDirty = async () => {
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
      {language === "yaml" ? <ErrorStrip lines={lines} /> : null}
    </>
  )

  const dirty = drafts.isDirty(name)
  const saveControls = (
    <SaveControls
      dirty={order.some((file) => drafts.isDirty(file))}
      discardable={dirty}
      saving={order.some((file) => drafts.get(file)?.saving === true)}
      onSave={() => void saveRef.current()}
      onDiscard={() => discard(name)}
    />
  )

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
        tabActions={draft !== null ? saveControls : undefined}
        status={<ChangeStatus change={data} />}
        notices={notices}
        heading={<ChangeHeading change={data} />}
        panelName="Change"
        panel={
          <ChangePanel
            projectKey={projectKey}
            change={data}
            tasks={
              <PanelTasks
                change={data}
                openYaml={
                  drafts.get(CHANGE_FILE) !== undefined && name !== CHANGE_FILE
                    ? () => navigate(to.change(projectKey, data.id, "tasks"))
                    : null
                }
              />
            }
            description={<ChangeDescription change={data} />}
          />
        }
      >
        {draft !== null ? (
          <FileEditor
            key={name}
            ref={code}
            store={draft.store}
            base={draft.loaded.text}
            name={name}
            language={language}
            errors={language === "yaml" ? errors : NO_ERRORS}
            view={view}
            onViewChange={setView}
            dirty={dirty}
            saved={drafts.isSaved(name)}
          />
        ) : null}
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
