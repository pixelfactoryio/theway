/** What the router does with a `popstate` or a `hashchange`. Pure: no React, no DOM. */

/**
 * - `own`: the event of the router's own navigation (wouter dispatches a `hashchange` for it): accepted.
 * - `seen`: the address is the one accepted already: nothing to do. Back and Forward fire `popstate`, then
 *   `hashchange` only when the two addresses differ by the fragment alone; the second event of a pair, and the event
 *   of a traversal undone, find the accepted address.
 * - `accept`: Back, Forward or a typed address, let through.
 * - `ask`: one that leaves a page with unsaved changes: undone, then asked.
 */
export type LocationAction = "own" | "seen" | "accept" | "ask";

export function locationAction(event: { own: boolean; href: string; acceptedHref: string; blocked: boolean }): LocationAction {
  if (event.own) return "own";
  if (event.href === event.acceptedHref) return "seen";
  return event.blocked ? "ask" : "accept";
}
