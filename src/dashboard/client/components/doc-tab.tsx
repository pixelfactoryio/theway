import { cn } from "cn"
import type { KeyboardEvent, MouseEvent, ReactNode, Ref } from "react"

/**
 * A document view, the same on every page that shows a file as a document (a change's files, an archived change, a
 * prompt's Preview): the scroll root that holds the document, under the page's title (`ItemHeading`), then the
 * footer. The scroll root is `data-scrolled` while it is scrolled from its top, which draws the title's hairline.
 * `scrollRef`, `className` and the handlers are the scroll root's (an editor's mode: its tint, its double-click, Esc).
 */
export function DocTab({
  footer,
  children,
  scrollRef,
  className,
  onDoubleClick,
  onKeyDown,
}: {
  footer: ReactNode
  children: ReactNode
  scrollRef?: Ref<HTMLDivElement>
  className?: string
  onDoubleClick?: (event: MouseEvent<HTMLElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
}) {
  return (
    <>
      <div
        ref={scrollRef}
        data-scroll-root
        onScroll={(e) => e.currentTarget.toggleAttribute("data-scrolled", e.currentTarget.scrollTop > 0)}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        className={cn("min-h-0 flex-1 overflow-y-auto", className)}
      >
        {children}
      </div>
      {footer}
    </>
  )
}
