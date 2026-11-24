import { Toast } from "@base-ui/react/toast"
import { CheckIcon } from "lucide-react"
import type { ReactNode } from "react"

/** How long a toast shows, in milliseconds. */
const TIMEOUT = 2000

/** The most toasts shown at once: an older one leaves for a newer one. */
const LIMIT = 3

/**
 * The dashboard's toasts, added from anywhere (`toasts.add`): the provider shows them. Held outside React, so adding
 * one renders only the toaster, not every control that can add one.
 */
export const toasts = Toast.createToastManager()

/** A toast's description, one line: the first line of a value that holds several. */
const firstLine = (text: ReactNode): ReactNode => (typeof text === "string" ? (text.split(/\r\n?|\n/)[0] ?? "") : text)

/**
 * The shown toasts, at the window's bottom right, 16px from both edges, at most 22rem wide; stacked 8px apart, the
 * newest at the bottom. Each is a menu's surface: the check in the secondary ink, the title in `text-sm` at 500, the
 * value under it in Geist Mono `text-xs`, one line cut with an ellipsis. It fades and rises 8px in and out over 150ms,
 * at once under reduced motion.
 */
function Toasts() {
  const shown = Toast.useToastManager().toasts
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed right-4 bottom-4 z-60 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none">
        {/* The manager lists the newest first. */}
        {[...shown].reverse().map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className="flex items-start gap-3 rounded-lg border border-rule bg-popover px-4 py-3 text-popover-foreground shadow-md transition-[opacity,translate] duration-150 data-ending-style:translate-y-2 data-ending-style:opacity-0 data-limited:hidden data-starting-style:translate-y-2 data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <Toast.Content className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Toast.Title className="text-sm font-medium" />
              <Toast.Description className="truncate font-mono text-xs text-muted-foreground">
                {firstLine(toast.description)}
              </Toast.Description>
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  )
}

/** The dashboard's toasts (`toasts.add`), around `children`; mounted once, in the app. */
export function Toaster({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toasts} timeout={TIMEOUT} limit={LIMIT}>
      {children}
      <Toasts />
    </Toast.Provider>
  )
}
