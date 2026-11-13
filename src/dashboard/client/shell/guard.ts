import { useSyncExternalStore } from "react"
import { navigate as hashNavigate, useHashLocation } from "wouter/use-hash-location"

import { locationAction, type Moving, positionOf, positionState, pushedPosition, reachedPosition } from "@/lib/location"

/**
 * The page holding unsaved changes: whether an address path leaves it, whether it has unsaved changes now, and how it
 * asks before leaving (`proceed` leaves).
 */
export type LeaveGuard = { leaves: (target: string) => boolean; isDirty: () => boolean; ask: (proceed: () => void) => void }

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

// The first entry the app sees keeps its position (a reload) or takes 0, set in place: its address stays.
if (positionOf(history.state) === null) history.replaceState(positionState(0), "", location.href)

/** The location the app shows, the full address it was accepted at, and that entry's position in the history. */
let accepted = hashPath()
let acceptedHref = location.href
let acceptedPosition = positionOf(history.state) ?? 0
let starting = false
/** The `history.go` the router has started and not yet seen arrive. */
let moving: Moving = null
const listeners = new Set<() => void>()
const acceptListeners = new Set<(traversal: boolean) => void>()

/** Takes the current address as the app's location; `traversal`: reached by Back, Forward or a typed address. */
function accept(traversal: boolean): void {
  accepted = hashPath()
  acceptedHref = location.href
  acceptedPosition = positionOf(history.state) ?? acceptedPosition
  for (const l of listeners) l()
  for (const l of acceptListeners) l(traversal)
}

/**
 * Calls `l` each time the app takes a new address, with whether it was reached by Back, Forward or a typed address;
 * the returned function stops it.
 */
export function onAccept(l: (traversal: boolean) => void): () => void {
  acceptListeners.add(l)
  return () => acceptListeners.delete(l)
}

const blocks = (target: string): boolean => guard !== null && guard.isDirty() && guard.leaves(target)

/** wouter's hash navigation, its entry marked with its position, its `hashchange` taken as this hook's own. */
function go(to: string, options?: { replace?: boolean; state?: unknown }): void {
  const replace = options?.replace === true
  starting = true
  try {
    hashNavigate(to, { replace, state: positionState(pushedPosition(acceptedPosition, replace)) })
  } finally {
    starting = false
  }
}

/**
 * Back, Forward and a typed address fire `popstate`, and `hashchange` only when the fragment alone differs (not when
 * the search part does too), so both are heard. An entry reached without a position (a typed address) is marked with
 * it in place. One that leaves a page with unsaved changes is undone by `history.go` back to the accepted entry, then
 * asked; leaving goes forth to it again. Neither rewrites an entry: the history stays as the browser left it.
 */
function onLocationEvent(): void {
  const position = reachedPosition(history.state, acceptedPosition)
  if (positionOf(history.state) === null) history.replaceState(positionState(position), "", location.href)
  const action = locationAction({
    own: starting,
    href: location.href,
    position,
    acceptedHref,
    acceptedPosition,
    moving,
    blocked: blocks(hashPath()),
  })
  if (action === "seen") return
  if (action === "returned") {
    moving = null
    return
  }
  if (action !== "ask") {
    moving = null
    accept(action === "accept")
    return
  }
  const from = acceptedPosition
  moving = { kind: "undo" }
  history.go(from - position)
  guard?.ask(() => {
    moving = { kind: "pass", to: position }
    history.go(position - from)
  })
}
addEventListener("popstate", onLocationEvent)
addEventListener("hashchange", onLocationEvent)

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
