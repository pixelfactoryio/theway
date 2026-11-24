import { ChevronDownIcon, type LucideIcon } from "lucide-react"
import { type ReactElement, type ReactNode, useContext, useState } from "react"

import { CopyButton, useCopy } from "@/components/copy"
import { PanelToggle, RecordBody, usePanelOpen } from "@/components/record-panel"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useClampCut } from "@/components/use-clamp-cut"
import { ViewTabs } from "@/components/view-tabs"
import type { RunCommand } from "@/lib/copy-targets"
import { HeaderCopyContext } from "@/shell/keys"
import { useWide } from "@/shell/panel"
import { type Crumb, PageHeader } from "@/shell/top-bar"

/**
 * A document's reading column, the same on every document page: the whole width between the panel's 16px gutters, the
 * header's and the views' own, so the page has one left edge. Within it, prose code blocks and tables keep one measure
 * (`PROSE_COLUMN`, a table no wider than its columns), all on the column's left edge.
 */
export const DOC_COLUMN = "px-4"

/** The measure of prose in the reading column, on its left edge: at most `--read-width` (about 70 characters a line). */
export const PROSE_COLUMN = "w-full max-w-(--read-width)"

/**
 * What a page's header copies: its ID or name (`value`), what the toast names it (`what`), and the commands its menu
 * copies, when the page has some.
 */
export type HeaderCopy = { value: string; what: string; commands?: readonly RunCommand[] }

/**
 * The header's copy, after the title: its copy button, which the `C` key runs too; with `commands`, joined to a
 * button opening the commands' menu, each command's label then the command in Geist Mono `text-xs` secondary ink.
 */
function HeaderCopyControl({ value, what, commands }: HeaderCopy) {
  const triggerRef = useContext(HeaderCopyContext) ?? undefined
  const { copy } = useCopy()
  const button = <CopyButton value={value} what={what} triggerRef={triggerRef} />
  if (commands === undefined || commands.length === 0) return button
  return (
    <ButtonGroup>
      {button}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-xs" aria-label="Copy a command" className="text-muted-foreground" />
          }
        >
          <ChevronDownIcon aria-hidden="true" className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto max-w-[min(32rem,calc(100vw-2rem))] min-w-56">
          {commands.map((c) => (
            <DropdownMenuItem key={c.command} onClick={() => copy(c.command, "the command")}>
              <span className="flex min-w-0 flex-col">
                <span>{c.label}</span>
                <span className="font-mono text-xs wrap-break-word text-muted-foreground">{c.command}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}

/** One view of an item: its own address, and a dot while it has unsaved edits. */
export type FrameTab = { value: string; label: string; href: string; dirty?: boolean }

/**
 * An item page's title, under its views and above every one of them, so it stands at the same place whichever view is
 * shown: in the reading column, 32px under the views and 16px over the view, at the reading scale's title size (22/28
 * at 600, which no heading of a document outranks), balanced over its lines and cut at three, with Show more to read
 * it whole when that cuts it; then what the page puts under it (the reasons a change cannot be read). An item with no
 * description has no title (`title` `null` or blank): its ID or file name stands once, in the header's path, and only
 * what the page puts under it shows. With `onEdit` a click on the title edits it, and `field` stands in its place. It never scrolls; the view under it does, and once that view is scrolled (its
 * scroll root `data-scrolled`, `DocTab`), a hairline closes the title off from the text passing under it.
 */
export function ItemHeading({
  title,
  field,
  onEdit,
  children,
}: {
  title: string | null
  /** The title's field while it is edited (`MarkdownField`), in its place. */
  field?: ReactNode
  /** Edits the title in place: a click on it (or Enter on it). */
  onEdit?: () => void
  children?: ReactNode
}) {
  const shown = title !== null && title.trim() !== "" ? title : null
  const [more, setMore] = useState(false)
  const editing = field !== undefined
  const [clampRef, cut] = useClampCut(shown !== null && !more && !editing ? shown : null)
  if (shown === null && !editing && (children === undefined || children === null || children === false)) return null
  // Joined by hand: the class merger takes `text-doc-title` for a colour and would drop it.
  const clamp = more ? "" : " line-clamp-3"
  return (
    <div
      className={`shrink-0 border-b border-transparent ${shown !== null || editing ? "pt-8" : "pt-6"} pb-4 transition-colors ${DOC_COLUMN} [&:has(~[data-scrolled])]:border-border`}
    >
      <div className={PROSE_COLUMN}>
        {editing ? (
          field
        ) : shown !== null && onEdit !== undefined ? (
          <h2 className="text-doc-title font-semibold tracking-tight text-balance text-foreground">
            <button
              ref={clampRef}
              type="button"
              aria-label={`${shown}. Edit the description`}
              onClick={onEdit}
              // Clamped, it is the clamp's box; whole, a block: either way it spans the column.
              className={`w-full cursor-text rounded-sm text-left outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring${more ? " block" : clamp}`}
            >
              {shown}
            </button>
          </h2>
        ) : shown !== null ? (
          <h2
            ref={clampRef}
            className={`text-doc-title font-semibold tracking-tight text-balance text-foreground${clamp}`}
          >
            {shown}
          </h2>
        ) : null}
        {!editing && shown !== null && (more || cut) ? (
          <Button variant="link" size="xs" onClick={() => setMore(!more)} className="mt-1 h-auto px-0 text-link">
            {more ? "Show less" : "Show more"}
          </Button>
        ) : null}
        {children}
      </div>
    </div>
  )
}

/**
 * An item's page, the one frame of a change's, a workflow's and a prompt's page, after Linear's item page: the header
 * holds the page's icon and path, its title (the item's ID or file name, `mono`), its `copy` and `lead` after it, then at the right
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
  copy,
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
  icon?: LucideIcon | ReactElement
  /** The page's path before its title. */
  parents?: readonly Crumb[]
  /** The title is an ID or a file name: Geist Mono `text-xs` (14px). */
  mono?: boolean
  /** What the header copies: the item's ID or name, and its run commands. */
  copy?: HeaderCopy
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
        copy={copy !== undefined ? <HeaderCopyControl {...copy} /> : undefined}
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
