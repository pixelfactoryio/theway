import { cn } from "cn"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "wouter"

import { PanelToggle, RecordBody, usePanelOpen } from "@/components/record-panel"
import type { PanelPage } from "@/lib/panel"
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
  page,
  panelName,
  panel,
  children,
}: {
  /** The browser tab's title. */
  title: string
  tabs: FrameTab[]
  value: string
  label: string
  page: PanelPage
  panelName: string
  panel: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = usePanelOpen()
  useDocumentTitle(title)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopRow>
        <nav aria-label={label} className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((tab) => {
            const active = tab.value === value
            return (
              <Link
                key={tab.value}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex shrink-0 items-center gap-2 px-4 text-sm transition-colors outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  active
                    ? "font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.Icon className="size-3.5" aria-hidden="true" />
                {tab.label}
                {tab.dirty === true ? (
                  <span role="img" aria-label="unsaved changes" className="size-1.5 rounded-full bg-foreground" />
                ) : null}
              </Link>
            )
          })}
        </nav>
        <div className="flex shrink-0 items-center">
          <PanelToggle page={page} open={open} onOpenChange={setOpen} />
        </div>
      </TopRow>
      <RecordBody name={panelName} panel={panel}>
        {children}
      </RecordBody>
    </div>
  )
}
