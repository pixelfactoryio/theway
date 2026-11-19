import { cn } from "cn"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "wouter"

import { PanelToggle, RecordBody, usePanelOpen } from "@/components/record-panel"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LINE_TAB } from "@/components/ui-classes"
import { TopRow, useDocumentTitle } from "@/shell/top-bar"

/**
 * A document's reading column, the same on every document page: the whole width between 24px gutters. Within it, prose
 * keeps its measure (`PROSE_COLUMN`) while code blocks and tables take up to `--read-wide` (64rem), all centred, so
 * hiding the sidebar or the panel gives code and tables room.
 */
export const DOC_COLUMN = "px-6"

/** The measure of prose in the reading column, centred: at most `--read-width` (708px, Notion's text column). */
export const PROSE_COLUMN = "mx-auto w-full max-w-(--read-width)"

/** One tab of a document: a view of it with its own address, its icon, and a dot while it has unsaved edits. */
export type FrameTab = { value: string; label: string; href: string; Icon: LucideIcon; dirty?: boolean }

/**
 * A document's page, after Conductor's: the top row holds the document's tabs (each a view with its own address) and
 * the panel's toggle; the content below; the panel `panel`, named `panelName`, in the shell's right column.
 */
export function DocFrame({
  title,
  tabs,
  value,
  label,
  panelName,
  panel,
  children,
}: {
  /** The browser tab's title. */
  title: string
  tabs: FrameTab[]
  value: string
  label: string
  panelName: string
  panel: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = usePanelOpen()
  useDocumentTitle(title)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopRow>
        <Tabs value={value} className="min-w-0 flex-1 gap-0">
          <TabsList
            variant="line"
            aria-label={label}
            className="h-full min-w-0 flex-1 justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 [scrollbar-width:none]"
          >
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                nativeButton={false}
                render={<Link href={tab.href} />}
                className={cn(LINE_TAB, "px-4")}
              >
                <tab.Icon className="size-3.5" aria-hidden="true" />
                {tab.label}
                {tab.dirty === true ? (
                  <span role="img" aria-label="unsaved changes" className="size-1.5 rounded-full bg-foreground" />
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex shrink-0 items-center">
          <PanelToggle open={open} onOpenChange={setOpen} />
        </div>
      </TopRow>
      <RecordBody name={panelName} panel={panel}>
        {children}
      </RecordBody>
    </div>
  )
}
