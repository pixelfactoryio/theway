/** What the router does with a `popstate` or a `hashchange`, and the history positions it reads. Pure: no React, no DOM. */

/**
 * Each history entry of the document holds its position in `history.state`: the first entry the app sees keeps the
 * one it has (a reload) or takes 0, an entry the app pushes takes the current one plus 1, a replace keeps it. A held
 * Back or Forward is undone by `history.go` over the distance between two positions, so no entry is rewritten.
 */
export type PositionState = { position: number };

/** The position an entry's `history.state` holds, `null` for an entry the app has not marked yet. */
export function positionOf(state: unknown): number | null {
  if (state === null || typeof state !== "object" || !("position" in state)) return null;
  const position = (state as { position: unknown }).position;
  return typeof position === "number" && Number.isInteger(position) ? position : null;
}

/** The `history.state` of the entry at `position`. */
export const positionState = (position: number): PositionState => ({ position });

/** The position of the entry the app's own navigation writes from the entry at `current`: the same with `replace`. */
export const pushedPosition = (current: number, replace: boolean): number => (replace ? current : current + 1);

/**
 * The position of the entry a `popstate` or `hashchange` reached: the one it holds, else the one after the accepted
 * entry. An entry the app has not marked is one an address typed in the address bar just added: the browser puts it
 * right after the current entry and drops the entries after it.
 */
export const reachedPosition = (state: unknown, acceptedPosition: number): number => positionOf(state) ?? acceptedPosition + 1;

/**
 * The `history.go` the router has started and not yet seen arrive: `undo` takes a held Back, Forward or typed address
 * back to the accepted entry; `pass` takes it, once the page lets it leave, to the entry at `to`.
 */
export type Moving = { kind: "undo" } | { kind: "pass"; to: number } | null;

/**
 * - `own`: the event of the router's own navigation (wouter dispatches a `hashchange` for it): accepted.
 * - `seen`: nothing to do. The address is the accepted one already: Back and Forward fire `popstate`, then
 *   `hashchange` only when the two addresses differ by the fragment alone, and the second event of a pair finds the
 *   address taken. Or a `history.go` of the router is on its way: the events before it arrives are the move it undoes.
 * - `returned`: the undo arrived at the accepted entry: the page stays, the history is as before the move.
 * - `accept`: Back, Forward or a typed address, let through; or the pass arrived at its entry.
 * - `ask`: one that leaves a page with unsaved changes: undone by `history.go(acceptedPosition - position)`, then
 *   asked; leaving goes `history.go(position - acceptedPosition)`.
 */
export type LocationAction = "own" | "seen" | "returned" | "accept" | "ask";

export function locationAction(event: {
  own: boolean;
  href: string;
  position: number;
  acceptedHref: string;
  acceptedPosition: number;
  moving: Moving;
  blocked: boolean;
}): LocationAction {
  if (event.own) return "own";
  if (event.moving?.kind === "undo") return event.position === event.acceptedPosition ? "returned" : "seen";
  if (event.moving?.kind === "pass") return event.position === event.moving.to ? "accept" : "seen";
  if (event.href === event.acceptedHref && event.position === event.acceptedPosition) return "seen";
  return event.blocked ? "ask" : "accept";
}
