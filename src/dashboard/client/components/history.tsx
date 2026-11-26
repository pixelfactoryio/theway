import { cn } from "cn"
import { useState, type ReactNode } from "react"

import { type CodeLanguage, CodeView, DiffView } from "@/components/code-view"
import { DocFooter } from "@/components/doc-footer"
import { EmptyNote } from "@/components/empty-note"
import type { FileDraft } from "@/components/file-draft"
import { PropertyCard } from "@/components/property-card"
import { type Segment, Segmented } from "@/components/segmented"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { DIALOG_TITLE } from "@/components/ui-classes"
import { apiPath, useHistory, useVersion } from "@/data/queries"
import { lineCounts, localTime } from "@/lib/edit"
import { DIFF_LAYOUT, type DiffLayout } from "@/lib/preferences"
import { PageLoadError } from "@/shell/load-error"
import { useStored } from "@/shell/storage"

/** The `localStorage` key of the difference's layout: `unified` or `split`; Unified when unset. */
const LAYOUT_KEY = "theway-diff-layout"

/** The difference's layouts, in the switch's order. */
const LAYOUTS: readonly Segment<DiffLayout>[] = [
  { value: "unified", label: "Unified" },
  { value: "split", label: "Split" },
]

/** The versions panel's selection: Current, or a version's id. */
const CURRENT = "current"

/**
 * The History tab of a file page: the Versions panel and the main area, from the file as saved (never the draft).
 * The selection and the Show changes switch stay out of the address; nothing here is a scroll root.
 */
export function useHistoryTab({
  draft,
  kind,
  project,
  name,
  language,
  active,
}: {
  draft: FileDraft
  kind: "workflows" | "prompts"
  project: string | null
  name: string
  language: CodeLanguage
  active: boolean
}): { panel: ReactNode; main: ReactNode } {
  const path = apiPath.file(kind, project, name)
  const versions = useHistory(path, active)
  const [chosen, setChosen] = useState<string | null>(null)
  const [show, setShow] = useState(true)
  const [layout, setLayout] = useStored(LAYOUT_KEY, DIFF_LAYOUT)
  const [confirm, setConfirm] = useState(false)

  const list = versions.data?.versions ?? []
  // The newest version at first, Current when there is none.
  const selected =
    chosen !== null && (chosen === CURRENT || list.some((v) => v.id === chosen)) ? chosen : (list[0]?.id ?? CURRENT)
  const version = list.find((v) => v.id === selected) ?? null
  const text = useVersion(path, version === null ? null : version.id, active)
  const saved = draft.loaded?.text ?? ""
  const isCurrent = version === null
  const time = version === null ? null : localTime(version.at)
  const same = text.data !== undefined && text.data.text === saved

  const rows = [null, ...list]
  const panel = (
    <PropertyCard title="Versions" meta={versions.data === undefined ? undefined : list.length}>
      {versions.data === undefined ? null : list.length === 0 ? (
        <div className="border-t border-rule">
          <EmptyNote>No version yet. A version is kept each time the dashboard saves or restores this file.</EmptyNote>
        </div>
      ) : (
        <ul aria-label="Versions" className="flex flex-col">
          {rows.map((v) => {
            const id = v === null ? CURRENT : v.id
            const on = id === selected
            return (
              <li key={id} className="border-t border-rule">
                <button
                  type="button"
                  aria-current={on || undefined}
                  onClick={() => setChosen(id)}
                  className={cn(
                    "flex h-9 w-full items-center gap-2 px-3 text-left tabular-nums transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    on && "bg-selected hover:bg-selected",
                  )}
                >
                  <span className={cn("min-w-0 flex-1 truncate", on ? "text-foreground" : "text-sidebar-foreground")}>
                    {v === null ? "Current" : localTime(v.at)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {v === null ? "as saved" : lineCounts(v.added, v.removed)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </PropertyCard>
  )

  const versionName = time === null ? "Current text" : `Version of ${time}`
  let body: ReactNode
  if (isCurrent) body = <CodeView text={saved} language={language} name="Current text" errors={[]} />
  else if (text.isError) {
    body = <PageLoadError what="this version" error={text.error} retry={() => void text.refetch()} />
  } else if (text.data === undefined) body = null
  else if (!show) body = <CodeView text={text.data.text} language={language} name={versionName} errors={[]} />
  else if (same) {
    body = <EmptyNote size="page">Same as the current file.</EmptyNote>
  } else {
    body = (
      <DiffView
        original={text.data.text}
        text={saved}
        layout={layout}
        language={language}
        names={{ original: versionName, text: "Current text" }}
      />
    )
  }

  const main = versions.isError ? (
    <PageLoadError what="the versions" error={versions.error} retry={() => void versions.refetch()} />
  ) : versions.data === undefined ? null : (
    <>
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-1">
        <span className="font-medium tabular-nums">{time === null ? "Current" : `Version of ${time}`}</span>
        {version !== null ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {lineCounts(version.added, version.removed)}
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="history-show-changes"
              size="sm"
              checked={show && !isCurrent}
              disabled={isCurrent}
              onCheckedChange={setShow}
            />
            <Label htmlFor="history-show-changes" className="leading-5 font-normal text-muted-foreground">
              Show changes
            </Label>
          </div>
          <Segmented
            label="Diff layout"
            value={layout}
            segments={LAYOUTS}
            disabled={isCurrent || !show}
            onChange={setLayout}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={isCurrent || text.data === undefined || same}
            onClick={() => setConfirm(true)}
          >
            Restore
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className={DIALOG_TITLE}>Restore the version of {time}?</AlertDialogTitle>
            <AlertDialogDescription render={<div />} className="flex flex-col gap-2">
              <p>The current text is kept as a version.</p>
              {draft.dirty ? <p>Your unsaved changes are dropped.</p> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirm(false)
                if (version === null) return
                void draft.restore(version.id).then((ok) => {
                  if (ok) setChosen(CURRENT)
                })
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return { panel, main }
}

/**
 * A file's History tab, the same on every page that keeps versions (a workflow, a prompt): the main area of
 * `useHistoryTab` on the whole width (its 40px bar over the difference), then the footer with the file's name and its
 * save state. The page's frame (`DocFrame`) gives its notices and its title above it.
 */
export function HistoryTab({ main, file, status }: { main: ReactNode; file: string; status: ReactNode }) {
  return (
    <>
      {main}
      <DocFooter file={file} status={status} />
    </>
  )
}
