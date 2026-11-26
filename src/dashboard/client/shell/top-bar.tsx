import { cn } from "cn"
import { ChevronRightIcon, type LucideIcon } from "lucide-react"
import {
  createContext,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
} from "react"
import { createPortal } from "react-dom"
import { Link } from "wouter"

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"

/**
 * Names the browser tab after the page: `<title> · theway`, or `theway` for an empty `title`, so tabs, history and
 * bookmarks tell pages apart.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title === "" ? "theway" : `${title} · theway`
  }, [title])
}

/**
 * The element the page's header renders into: the top of the work area's panel, above the page and its docked panel,
 * so the header spans both. `undefined` outside the shell (a page rendered alone), where the header renders in place.
 */
export const HeaderSlot = createContext<HTMLElement | null | undefined>(undefined)

/** Renders `children` into the shell's header slot, or in place outside the shell. */
function InHeader({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlot)
  if (slot === undefined) return <>{children}</>
  return slot === null ? null : createPortal(children, slot)
}

/**
 * The sidebar's button at the left of a header, below 768px only, where the sidebar opens over the page. Wider, the
 * sidebar keeps its own button.
 */
function ShowSidebar() {
  const sidebar = useSidebar()
  if (!sidebar.isMobile) return null
  return <SidebarTrigger className="-ml-1 size-7 shrink-0 text-muted-foreground" />
}

/**
 * The work area's 44px header row, the same on every page: the sidebar button when the sidebar is hidden, then
 * `children` (the page's place and its actions), on the panel's 16px gutter at the left and 12px at the right, where
 * the icon buttons stand.
 */
export function TopRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <InHeader>
      <div className={cn("flex h-11 shrink-0 items-center gap-2 pr-3 pl-4", className)}>
        <ShowSidebar />
        {children}
      </div>
    </InHeader>
  )
}

/** One step of a page's path above it: its label and the page it opens. */
export type Crumb = { label: string; href: string }

/**
 * A page's header: its icon, its path (`parents`, then its title, the page's `h1`), then `actions` at the right; and,
 * under it, `tabs` (its views, as `ViewTabs`) when the page has some. `copy` (the page's copy controls, `DocFrame`'s: its ID and its run command)
 * stands right after the title, outside the path, so the title is cut before it; then `lead` (a pin's star). The title is the interface's `text-sm` (15px) at 600 (an ID, with `mono`, Geist Mono `text-xs`, 14px, at 500); the path before it is
 * secondary. In a narrow header the path is cut first (its links shrink far faster), the title last, within the path's
 * room: the title never runs under the copy control after it.
 */
export function PageHeader({
  title,
  icon: Icon,
  parents = [],
  mono = false,
  copy,
  lead,
  actions,
  tabs,
}: {
  title: string
  /** A Lucide icon, drawn in the secondary ink, or a mark of its own (a project's, in its hue). */
  icon?: LucideIcon | ReactElement
  parents?: readonly Crumb[]
  mono?: boolean
  copy?: ReactNode
  lead?: ReactNode
  actions?: ReactNode
  tabs?: ReactNode
}) {
  useDocumentTitle(title)
  return (
    <InHeader>
      <div className="flex h-11 shrink-0 items-center gap-2 pr-3 pl-4">
        <ShowSidebar />
        <nav aria-label="Location" className="flex min-w-0 items-center gap-2">
          {Icon === undefined ? null : isValidElement(Icon) ? (
            Icon
          ) : (
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          )}
          {parents.map((p) => (
            <Fragment key={p.href}>
              <Link
                href={p.href}
                className="min-w-0 shrink-[999] truncate rounded-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {p.label}
              </Link>
              <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            </Fragment>
          ))}
          <h1 className={cn("min-w-0 truncate font-semibold", mono && "font-mono text-xs font-medium")}>{title}</h1>
        </nav>
        {copy !== undefined ? <div className="flex shrink-0 items-center gap-1">{copy}</div> : null}
        {lead !== undefined ? <div className="flex shrink-0 items-center">{lead}</div> : null}
        {actions !== undefined ? <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {tabs}
    </InHeader>
  )
}

/** The page wrapper below the header: it never scrolls; the page's `data-scroll-root` element does. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
}
