import { cn } from "cn"
import { type ReactNode, useEffect } from "react"
import { Link } from "wouter"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
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
 * The sidebar's button at the left of a top row, below 768px only, where the sidebar opens over the page. Wider, the
 * collapsed sidebar is a rail of icons that keeps its own button.
 */
function ShowSidebar() {
  const sidebar = useSidebar()
  if (!sidebar.isMobile) return null
  return <SidebarTrigger className="mr-1 size-7 self-center text-muted-foreground" />
}

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
 * A list page's top row: its title, after a breadcrumb link to the page it sits in when `parent` is given, then its
 * actions at the right.
 */
export function PageHeader({
  title,
  actions,
  parent,
}: {
  title: string
  actions?: ReactNode
  parent?: { label: string; href: string }
}) {
  useDocumentTitle(title)
  return (
    <TopRow className="px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {parent !== undefined ? (
          <>
            <h1 className="sr-only">{title}</h1>
            {/* `text-heading` goes on the items: on the list, tailwind-merge reads it as a colour and drops the
                list's `text-muted-foreground`. `flex-nowrap` keeps one line, where the title truncates. */}
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="shrink-0 text-heading">
                  <BreadcrumbLink render={<Link href={parent.href} />}>{parent.label}</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0 text-heading">
                  <BreadcrumbPage className="min-w-0 truncate font-semibold">{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </>
        ) : (
          <h1 className="truncate text-heading font-semibold">{title}</h1>
        )}
      </div>
      {actions !== undefined ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </TopRow>
  )
}

/** The page wrapper below the top row: it never scrolls; the page's `data-scroll-root` element does. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
}
