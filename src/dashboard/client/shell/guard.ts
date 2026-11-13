import { useSyncExternalStore } from "react"
import { navigate as hashNavigate, useHashLocation } from "wouter/use-hash-location"

import { type FilePageId, leavesPage } from "@/lib/edit"

/**
 * The page holding unsaved changes: its file, whether it has unsaved changes now, and how it asks before leaving
 * (`proceed` leaves).
 */
export type LeaveGuard = { page: FilePageId; isDirty: () => boolean; ask: (proceed: () => void) => void }

let guard: LeaveGuard | null = null

/** Sets the page's guard; the returned function removes it. */
export function setLeaveGuard(next: LeaveGuard): () => void {
  guard = next
  return () => {
    if (guard === next) guard = null
  }
}

/** The address path of the hash, as `useHashLocation` reads it. */
const hashPath = (): string => "/" + location.hash.replace(/^#?\/?/, "")

/** The location the app shows, and the full address it was accepted at. */
let accepted = hashPath()
let acceptedHref = location.href
let starting = false
const listeners = new Set<() => void>()

function accept(): void {
  accepted = hashPath()
  acceptedHref = location.href
  for (const l of listeners) l()
}

const blocks = (target: string): boolean => guard !== null && guard.isDirty() && leavesPage(guard.page, target)

/** wouter's hash navigation, its `hashchange` taken as this hook's own. */
function go(to: string, options?: { replace?: boolean; state?: unknown }): void {
  starting = true
  try {
    hashNavigate(to, options)
  } finally {
    starting = false
  }
}

// A `hashchange` this hook did not start (Back, Forward, a typed address) that leaves a page with unsaved changes is
// undone to the accepted address, then asked; wouter dispatches `replaceState` (not `hashchange`) for that call.
addEventListener("hashchange", () => {
  if (starting || !blocks(hashPath())) {
    accept()
    return
  }
  const targetHref = location.href
  history.replaceState(history.state, "", acceptedHref)
  guard?.ask(() => {
    history.replaceState(history.state, "", targetHref)
    accept()
  })
})

/** The guarded `navigate`: every link, the sidebar and the project selector ask first when they leave unsaved changes. */
function navigate(to: string, options?: { replace?: boolean; state?: unknown }): void {
  if (blocks(to.replace(/^#?/, ""))) {
    guard?.ask(() => go(to, options))
    return
  }
  go(to, options)
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The app's location hook: the hash location as accepted, with the guarded `navigate`. */
export function useGuardedLocation(): [string, typeof navigate] {
  return [useSyncExternalStore(subscribe, () => accepted), navigate]
}

/** Every rendered link's `href` keeps its `#`: wouter's `useHashLocation.hrefs`, which its types leave out. */
useGuardedLocation.hrefs = (useHashLocation as typeof useHashLocation & { hrefs: (href: string) => string }).hrefs
