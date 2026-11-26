import { CheckIcon, ChevronDownIcon, type LucideIcon, SquareTerminalIcon } from "lucide-react"
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

/** What a page's header copies after its title: its ID or name (`value`), and what the toast names it (`what`). */
export type HeaderCopy = { value: string; what: string }

/** The header's copy, after the title: its copy button, which the `C` key runs too. */
function HeaderCopyControl({ value, what }: HeaderCopy) {
  const triggerRef = useContext(HeaderCopyContext) ?? undefined
  return <CopyButton value={value} what={what} triggerRef={triggerRef} />
}

/**
 * The header's run command, at the left of its actions: an outline `icon-sm` button "Copy run command" (a terminal, so it
 * is not taken for the title's copy button; no tooltip, the toast says what was copied) copying the first of
 * `commands` (its icon a check for 1.5s after a copy); with more commands, joined
 * to a chevron "More run commands" whose menu copies the others, each command's label over the command in Geist Mono
 * `text-xs` secondary ink.
 */
export function RunCommandControl({ commands }: { commands: readonly RunCommand[] }) {
  const { copy, copied } = useCopy()
  const [primary, ...more] = commands
  if (primary === undefined) return null
  const button = (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label="Copy run command"
      onClick={() => copy(primary.command, "the command")}
    >
      {copied ? <CheckIcon aria-hidden="true" /> : <SquareTerminalIcon aria-hidden="true" />}
    </Button>
  )
  if (more.length === 0) return button
  return (
    <ButtonGroup>
      {button}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="More run commands" />}>
          <ChevronDownIcon aria-hidden="true" className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto max-w-[min(32rem,calc(100vw-2rem))] min-w-56">
          {more.map((c) => (
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
 * shown (a workflow's canvas): in the reading column, 32px under the views and 16px over the view, at the reading
 * scale's title size (22/28 at 600, which no heading of a document outranks), balanced over its lines and cut at three,
 * with Show more to read it whole when that cuts it; then what the page puts under it (the reasons a change cannot be
 * read). An item with no description has no title (`title` `null` or blank): only what the page puts under it shows. A
 * file's own views have none: the file is what is read. It never scrolls; the view under it does, and once that view
 * is scrolled (its scroll root `data-scrolled`), a hairline closes the title off from the text passing under it.
 */
export function ItemHeading({ title, children }: { title: string | null; children?: ReactNode }) {
  const shown = title !== null && title.trim() !== "" ? title : null
  const [more, setMore] = useState(false)
  const [clampRef, cut] = useClampCut(shown !== null && !more ? shown : null)
  if (shown === null && (children === undefined || children === null || children === false)) return null
  // Joined by hand: the class merger takes `text-doc-title` for a colour and would drop it.
  const clamp = more ? "" : " line-clamp-3"
  return (
    <div
      className={`shrink-0 border-b border-transparent ${shown !== null ? "pt-8" : "pt-6"} pb-4 transition-colors ${DOC_COLUMN} [&:has(~[data-scrolled])]:border-border`}
    >
      <div className={PROSE_COLUMN}>
        {shown !== null ? (
          <h2
            ref={clampRef}
            className={`text-doc-title font-semibold tracking-tight text-balance text-foreground${clamp}`}
          >
            {shown}
          </h2>
        ) : null}
        {shown !== null && (more || cut) ? (
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
 * holds the page's icon and path, its title (the item's ID or file name, `mono`), its `copy` and its `run` commands' button after it, then `lead`, then at the right
 * `actions`, the item's `status` while the panel is not shown (below 1280px, or hidden), and the panel's toggle; its
 * views (`tabs`, each with its own address) are pills under it, `tabActions` (the shown file's save controls) at their right. Below: the page's `notices` (full-width strips), its
 * `heading` (an `ItemHeading`, the same on every view), then the view; the panel `panel`, a `PropertyCards` stack named
 * `panelName`, in the shell's right column.
 */
export function DocFrame({
  title,
  icon,
  parents,
  mono = false,
  copy,
  run,
  lead,
  actions,
  tabs,
  tabActions,
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
  /** What the header copies after its title: the item's ID or name. */
  copy?: HeaderCopy
  /** The item's run commands, the first on the header's "Copy run command" button, the others in its menu. */
  run?: readonly RunCommand[]
  lead?: ReactNode
  actions?: ReactNode
  tabs: FrameTab[]
  /** At the right of the tab row: the shown file's save controls. */
  tabActions?: ReactNode
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
        copy={
          copy !== undefined || run !== undefined ? (
            <>
              {copy !== undefined ? <HeaderCopyControl {...copy} /> : null}
              {run !== undefined ? <RunCommandControl commands={run} /> : null}
            </>
          ) : undefined
        }
        lead={lead}
        actions={
          <>
            {actions}
            {status !== undefined && !panelShown ? <div className="mr-2 flex items-center gap-3">{status}</div> : null}
            <PanelToggle open={open} onOpenChange={setOpen} />
          </>
        }
        tabs={<ViewTabs label={label} value={value} tabs={tabs} actions={tabActions} />}
      />
      <RecordBody name={panelName} panel={panel}>
        {notices}
        {heading}
        {children}
      </RecordBody>
    </div>
  )
}
