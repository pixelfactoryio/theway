import { cn } from "cn"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "wouter"

import { PanelToggle, RecordBody, usePanelOpen } from "@/components/record-panel"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import type { PanelPage } from "@/lib/panel"

/** The sidebar's button, shown at the left of a top row while the sidebar is hidden. */
function ShowSidebar() {
  const sidebar = useSidebar()
  if (!sidebar.isMobile && sidebar.state !== "collapsed") return null
  return <SidebarTrigger className="mr-1 size-7 self-center text-muted-foreground" />
}

/** One tab of a document: a view of it with its own address, its icon, and a dot while it has unsaved edits. */
export type FrameTab = { value: string; label: string; href: string; Icon: LucideIcon; dirty?: boolean }

/** A page's 44px top row, level with the panel's header: the sidebar button when hidden, then `children`. */
export function TopRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-11 shrink-0 items-stretch border-b px-2", className)}>
      <ShowSidebar />
      {children}
    </div>
  )
}

/**
 * A list page's top row: the page it sits in (`parent`, a link) then its title, a muted detail after it, then its
 * actions at the right.
 */
export function PageHeader({
  title,
  detail,
  actions,
  parent,
}: {
  title: string
  detail?: ReactNode
  actions?: ReactNode
  parent?: { label: string; href: string }
}) {
  return (
    <TopRow className="px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {parent !== undefined ? (
          <>
            <Link
              href={parent.href}
              className="shrink-0 rounded-sm text-heading text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {parent.label}
            </Link>
            <span aria-hidden="true" className="-mx-1 text-muted-foreground">
              /
            </span>
          </>
        ) : null}
        <h1 className="truncate text-heading font-semibold">{title}</h1>
        {detail !== undefined ? <span className="truncate text-sm text-muted-foreground">{detail}</span> : null}
      </div>
      {actions !== undefined ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </TopRow>
  )
}

/**
 * A document's page, after Conductor's: the top row holds the document's tabs (each a view with its own address) and
 * the panel's toggle; the content below; the panel `panel`, named `panelName`, in the shell's right column.
 */
export function DocFrame({
  tabs,
  value,
  label,
  page,
  panelName,
  panel,
  children,
}: {
  tabs: FrameTab[]
  value: string
  label: string
  page: PanelPage
  panelName: string
  panel: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = usePanelOpen()
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
                  "relative flex shrink-0 items-center gap-2 px-4 text-sm transition-colors outline-none focus-visible:bg-accent",
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
