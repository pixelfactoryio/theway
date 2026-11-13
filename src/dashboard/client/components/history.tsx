import { useQuery } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"

import { type CodeLanguage, CodeView, DiffView } from "@/components/code-view"
import type { FileDraft } from "@/components/draft"
import { Badge } from "@/components/reui/badge"
import { Timeline, TimelineContent, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from "@/components/reui/timeline"
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { lineCounts, localTime } from "@/lib/edit"
import { fileApi } from "@/lib/files"
import { LoadError } from "@/shell/load-error"
import { getJson } from "@/shell/projects"

/** One version of `GET …/history`. */
type Version = { id: string; at: string; added: number; removed: number }

type Layout = "unified" | "split"

/** The `localStorage` key of the difference's layout: `unified` or `split`; Unified when unset. */
const LAYOUT_KEY = "theway-diff-layout"

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "split" ? "split" : "unified"
  } catch {
    return "unified"
  }
}

function writeLayout(layout: Layout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, layout)
  } catch {
    // The choice still applies to this page.
  }
}

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
  const api = fileApi(kind, project, name)
  const versions = useQuery({
    queryKey: ["history", api],
    queryFn: () => getJson<{ versions: Version[] }>(`${api}/history`),
    enabled: active,
  })
  const [chosen, setChosen] = useState<string | null>(null)
  const [show, setShow] = useState(true)
  const [layout, setLayout] = useState<Layout>(readLayout)
  const [confirm, setConfirm] = useState(false)

  const list = versions.data?.versions ?? []
  // The newest version at first, Current when there is none.
  const selected = chosen !== null && (chosen === CURRENT || list.some((v) => v.id === chosen)) ? chosen : (list[0]?.id ?? CURRENT)
  const version = list.find((v) => v.id === selected) ?? null
  const text = useQuery({
    queryKey: ["version", api, selected],
    queryFn: () => getJson<{ text: string }>(`${api}/history/${selected}`),
    enabled: active && version !== null,
    staleTime: Infinity,
  })
  const saved = draft.loaded?.text ?? ""
  const isCurrent = version === null
  const time = version === null ? null : localTime(version.at)
  const same = text.data !== undefined && text.data.text === saved

  const panel = (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-medium">Versions</h2>
      {versions.data === undefined ? null : list.length === 0 ? (
        <Empty className="p-0">
          <EmptyHeader>
            <EmptyTitle>No version yet</EmptyTitle>
            <EmptyDescription>A version is kept each time the dashboard saves this file.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Timeline value={0}>
          {[null, ...list].map((v, i) => {
            const id = v === null ? CURRENT : v.id
            const on = id === selected
            return (
              <TimelineItem key={id} step={i + 1} className="ms-8">
                <TimelineHeader>
                  <TimelineSeparator className="bg-border group-data-[orientation=vertical]/timeline:w-px" />
                  <TimelineTitle className="font-normal">
                    <button
                      type="button"
                      aria-current={on || undefined}
                      onClick={() => setChosen(id)}
                      className={
                        on
                          ? "rounded-sm text-left text-sm font-medium tabular-nums outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                          : "rounded-sm text-left text-sm text-muted-foreground tabular-nums outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      }
                    >
                      {v === null ? <Badge variant={on ? "primary-light" : "outline"}>Current</Badge> : localTime(v.at)}
                    </button>
                  </TimelineTitle>
                  <TimelineIndicator
                    className={
                      on
                        ? "mt-1 size-3 border border-primary bg-primary"
                        : "mt-1 size-3 border border-muted-foreground/40 bg-background"
                    }
                  />
                </TimelineHeader>
                {v !== null ? <TimelineContent className="text-xs tabular-nums">{lineCounts(v.added, v.removed)}</TimelineContent> : null}
              </TimelineItem>
            )
          })}
        </Timeline>
      )}
    </div>
  )

  const versionName = time === null ? "Current text" : `Version of ${time}`
  let body: ReactNode = null
  if (isCurrent) body = <CodeView text={saved} language={language} name="Current text" errors={[]} />
  else if (text.isError) {
    body = <LoadError what="this version" error={text.error} retry={() => void text.refetch()} className="m-4 w-auto" />
  } else if (text.data === undefined) body = null
  else if (!show) body = <CodeView text={text.data.text} language={language} name={versionName} errors={[]} />
  else if (same) {
    body = (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Same as the current file.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
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
    <LoadError what="the versions" error={versions.error} retry={() => void versions.refetch()} className="m-4 w-auto" />
  ) : versions.data === undefined ? null : (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
        <span className="text-sm font-medium tabular-nums">{time ?? "Current"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="history-show-changes" checked={show && !isCurrent} disabled={isCurrent} onCheckedChange={setShow} />
            <Label htmlFor="history-show-changes" className="font-normal">
              Show changes
            </Label>
          </div>
          <ToggleGroup
            variant="outline"
            aria-label="Diff layout"
            value={[layout]}
            disabled={isCurrent || !show}
            onValueChange={(next: string[]) => {
              // Pressing the pressed item empties the value: the current layout stays selected and stored.
              const picked = next[0]
              if (picked !== "unified" && picked !== "split") return
              setLayout(picked)
              writeLayout(picked)
            }}
          >
            <ToggleGroupItem value="unified">Unified</ToggleGroupItem>
            <ToggleGroupItem value="split">Split</ToggleGroupItem>
          </ToggleGroup>
          <Button disabled={isCurrent || text.data === undefined || same} onClick={() => setConfirm(true)}>
            Restore
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore the version of {time}?</AlertDialogTitle>
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
