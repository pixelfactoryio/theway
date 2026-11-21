import type { ReactNode } from "react"

/**
 * A document view, the same on every page that shows a file as a document (a change's files, an archived change, a
 * prompt's Preview): the scroll root that holds the document, under the page's title (`ItemHeading`), then the
 * footer. The scroll root is `data-scrolled` while it is scrolled from its top, which draws the title's hairline.
 */
export function DocTab({ footer, children }: { footer: ReactNode; children: ReactNode }) {
  return (
    <>
      <div
        data-scroll-root
        onScroll={(e) => e.currentTarget.toggleAttribute("data-scrolled", e.currentTarget.scrollTop > 0)}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {children}
      </div>
      {footer}
    </>
  )
}
