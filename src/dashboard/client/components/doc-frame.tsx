import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { PanelToggle, RecordBody, usePanelOpen } from "@/components/record-panel"
import { ViewTabs } from "@/components/view-tabs"
import { useWide } from "@/shell/panel"
import { type Crumb, PageHeader } from "@/shell/top-bar"

/**
 * A document's reading column, the same on every document page: the whole width between 24px gutters. Within it, prose
 * code blocks and tables keep one measure (`PROSE_COLUMN`, a table no wider than its columns), all on the column's left
 * edge.
 */
export const DOC_COLUMN = "px-6"

/** The measure of prose in the reading column, on its left edge: at most `--read-width` (about 70 characters a line). */
export const PROSE_COLUMN = "w-full max-w-(--read-width)"

/** One view of an item: its own address, and a dot while it has unsaved edits. */
export type FrameTab = { value: string; label: string; href: string; dirty?: boolean }

/**
 * An item page's title, under its views and above every one of them, so it stands at the same place whichever view is
 * shown: in the reading column, 32px under the views and 16px over the view, at the reading scale's title size (28/34
 * at 600, over a document's 20px h1), at most two lines (the whole title on hover), then what the page puts under it
 * (the reasons a change cannot be read). An item with no description has no title (`title` `null` or blank): its ID or
 * file name stands once, in the header's path, and only what the page puts under it shows. It never scrolls; the view
 * under it does, and once that view is scrolled (its scroll root `data-scrolled`, `DocTab`), a hairline closes the
 * title off from the text passing under it.
 */
export function ItemHeading({ title, children }: { title: string | null; children?: ReactNode }) {
  const shown = title !== null && title.trim() !== "" ? title : null
  if (shown === null && (children === undefined || children === null || children === false)) return null
  return (
    <div
      className={`shrink-0 border-b border-transparent ${shown !== null ? "pt-8" : "pt-6"} pb-4 transition-colors ${DOC_COLUMN} [&:has(~[data-scrolled])]:border-border`}
    >
      <div className={PROSE_COLUMN}>
        {shown !== null ? (
          <h2
            title={shown}
            className="line-clamp-2 text-doc-title font-semibold tracking-tight text-pretty text-foreground"
          >
            {shown}
          </h2>
        ) : null}
        {children}
      </div>
    </div>
  )
}

/**
 * An item's page, the one frame of a change's, a workflow's and a prompt's page, after Linear's item page: the header
 * holds the page's icon and path, its title (the item's ID or file name, `mono`), `lead` after it, then at the right
 * `actions`, the item's `status` while the panel is not shown (below 1280px, or hidden), and the panel's toggle; its
 * views (`tabs`, each with its own address) are pills under it. Below: the page's `notices` (full-width strips), its
 * `heading` (an `ItemHeading`, the same on every view), then the view; the panel `panel`, a `PropertyCards` stack named
 * `panelName`, in the shell's right column.
 */
export function DocFrame({
  title,
  icon,
  parents,
  mono = false,
  lead,
  actions,
  tabs,
  value,
  label,
  status,
  panelName,
  panel,
  notices,
  heading,
  children,
}: {
  /** The header's title, the page's `h1`, and the browser tab's title. */
  title: string
  icon?: LucideIcon
  /** The page's path before its title. */
  parents?: readonly Crumb[]
  /** The title is an ID or a file name: Geist Mono 12px. */
  mono?: boolean
  lead?: ReactNode
  actions?: ReactNode
  tabs: FrameTab[]
  value: string
  label: string
  status?: ReactNode
  panelName: string
  panel: ReactNode
  notices?: ReactNode
  heading: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = usePanelOpen()
  const wide = useWide()
  const panelShown = wide && open
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={title}
        icon={icon}
        parents={parents}
        mono={mono}
        lead={lead}
        actions={
          <>
            {actions}
            {status !== undefined && !panelShown ? <div className="mr-2 flex items-center gap-3">{status}</div> : null}
            <PanelToggle open={open} onOpenChange={setOpen} />
          </>
        }
        tabs={<ViewTabs label={label} value={value} tabs={tabs} />}
      />
      <RecordBody name={panelName} panel={panel}>
        {notices}
        {heading}
        {children}
      </RecordBody>
    </div>
  )
}
