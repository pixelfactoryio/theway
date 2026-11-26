import { CodeXmlIcon, EyeIcon } from "lucide-react"
import { useEffect, useSyncExternalStore, type Ref } from "react"

import { type CodeLanguage, type CodeViewHandle, EditableCodeView } from "@/components/code-view"
import { DocFooter, LineCount } from "@/components/doc-footer"
import { SavedStatus } from "@/components/file-page"
import { MarkdownView } from "@/components/markdown-view"
import { type Segment, Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import type { DraftStore } from "@/drafts/draft-store"
import { changedLineCount, setBase } from "@/lib/changed-lines"
import type { FileError } from "@/lib/files"
import { countOf } from "@/lib/list-filter"
import { MOD, shortcutText } from "@/shell/platform"

/** How a file is shown: its source or its rendered preview. */
export type FileView = "source" | "preview"

const VIEWS: readonly Segment<FileView>[] = [
  { value: "source", label: "Source", icon: <CodeXmlIcon aria-hidden="true" /> },
  { value: "preview", label: "Preview", icon: <EyeIcon aria-hidden="true" /> },
]

/** The language a file's status bar names. */
const LANGUAGE_NAME: Record<CodeLanguage, string> = { markdown: "Markdown", prompt: "Markdown", yaml: "YAML" }

/** Whether a file of `language` has a rendered preview: Markdown files (a change's documents, a prompt) do. */
export const previewable = (language: CodeLanguage): boolean => language !== "yaml"

/**
 * A file page's save controls, at the right of its tab row: "Unsaved changes" while the shown file differs from its
 * saved text (from 1024px; below, the dot on its tab says it), Discard (which asks first) and Save with its shortcut,
 * last. Discard and Save are always there, disabled while the file equals its saved text, so nothing moves when
 * editing starts.
 */
export function SaveControls({
  dirty,
  saving = false,
  onSave,
  onDiscard,
}: {
  dirty: boolean
  saving?: boolean
  onSave: () => void
  onDiscard: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      {dirty ? <span className="hidden text-xs text-muted-foreground lg:inline">Unsaved changes</span> : null}
      <Button variant="ghost" size="xs" onClick={onDiscard} disabled={!dirty}>
        Discard
      </Button>
      <Button size="xs" onClick={onSave} disabled={!dirty || saving}>
        Save
        <span className="font-mono opacity-70">{shortcutText([MOD, "S"])}</span>
      </Button>
    </div>
  )
}

/** The cursor's line and column in `store`'s state, 1-based, as `Ln 7, Col 14`. */
function cursorText(store: DraftStore): string {
  const state = store.getState()
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  return `Ln ${line.number}, Col ${head - line.from + 1}`
}

/**
 * The file's status bar, the footer of every file view: its name, its language and its line count, then a Markdown
 * file's `Source | Preview` switch (`onViewChange`), beside the language it belongs to; at the right the
 * cursor's place (not in Preview) and the save state: the lines changed while it differs from the file, else Saved
 * for a moment after a save.
 */
function FileStatus({
  store,
  name,
  language,
  view,
  onViewChange,
  dirty,
  saved,
}: {
  store: DraftStore
  name: string
  language: CodeLanguage
  view: FileView
  onViewChange?: (view: FileView) => void
  dirty: boolean
  saved: boolean
}) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const changed = changedLineCount(state)
  return (
    <DocFooter
      file={name}
      details={[LANGUAGE_NAME[language], <LineCount text={state.sliceDoc()} />]}
      tools={
        onViewChange !== undefined && previewable(language) ? (
          <Segmented label="File view" size="sm" value={view} segments={VIEWS} onChange={onViewChange} />
        ) : undefined
      }
      status={
        <span className="flex items-center gap-3 tabular-nums">
          {view !== "preview" ? <span>{cursorText(store)}</span> : null}
          {dirty && changed > 0 ? (
            <span className="text-foreground">{countOf(changed, "line")} changed</span>
          ) : (
            <SavedStatus saved={saved} />
          )}
        </span>
      }
    />
  )
}

/** The rendered preview of the draft's text, read live as it is typed. */
function Preview({ store, name }: { store: DraftStore; name: string }) {
  const text = useSyncExternalStore(store.subscribe, () => store.getState().sliceDoc())
  return (
    <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
      <MarkdownView text={text} name={`${name} preview`} />
    </div>
  )
}

/**
 * Every file the dashboard opens, edited whole, as in Zed or VS Code: the draft's source editor (line numbers, the
 * current line, the language's colours, a bar beside each line that differs from `base`), or for a Markdown file its
 * rendered preview; then the file's status bar. The page keeps the drafts, the save and the guards; this view only edits.
 */
export function FileEditor({
  store,
  base,
  name,
  language,
  errors,
  view,
  onViewChange,
  dirty,
  saved,
  ref,
}: {
  store: DraftStore
  /** The file's text as last loaded or saved, which the changed lines are counted against. */
  base: string
  name: string
  language: CodeLanguage
  /** The applied check's errors, marked on their lines. */
  errors: readonly FileError[]
  view: FileView
  /** Switches a Markdown file between Source and Preview from its status bar; none, no switch. */
  onViewChange?: (view: FileView) => void
  dirty: boolean
  saved: boolean
  ref?: Ref<CodeViewHandle>
}) {
  const shown: FileView = previewable(language) ? view : "source"

  // The base again after a new state (Discard, Reload, Restore), which starts without one.
  const generation = useSyncExternalStore(store.subscribe, () => store.generation)
  useEffect(() => {
    store.dispatch({ effects: setBase.of(base) })
  }, [store, base, generation])

  return (
    <>
      <div className="flex min-h-0 flex-1">
        {shown === "source" ? (
          <div className="min-h-0 min-w-0 flex-1">
            <EditableCodeView ref={ref} draft={store} errors={errors} />
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Preview store={store} name={name} />
          </div>
        )}
      </div>
      <FileStatus
        store={store}
        name={name}
        language={language}
        view={shown}
        onViewChange={onViewChange}
        dirty={dirty}
        saved={saved}
      />
    </>
  )
}
