import { RouteIcon } from "lucide-react"
import { Link } from "wouter"

import { IconTile } from "@/components/reui/icon-tile"
import { SidebarTrigger } from "@/components/ui/sidebar"

/**
 * The full-width header above the sidebar: the sidebar toggle below 768px (where the sidebar is a sheet), the theway
 * mark linking home, a separator, then the slot the page's `TopBar` renders its breadcrumb and actions into.
 */
export function SiteHeader({ setSlot }: { setSlot: (slot: HTMLDivElement | null) => void }) {
  return (
    <header className="sticky top-0 z-50 flex w-full items-center border-b bg-background">
      <div className="flex h-(--header-height) w-full items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1 md:hidden" />
        <Link href="/?" aria-label="theway home" className="flex shrink-0 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <IconTile variant="soft" size="sm">
            <RouteIcon className="size-4" aria-hidden="true" />
          </IconTile>
        </Link>
        <span aria-hidden="true" className="text-muted-foreground">
          /
        </span>
        <div ref={setSlot} className="flex min-w-0 flex-1 items-center gap-2" />
      </div>
    </header>
  )
}
