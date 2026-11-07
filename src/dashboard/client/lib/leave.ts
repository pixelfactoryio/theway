/**
 * The guard on leaving a page with unsaved edits: the hash location the router uses asks the registered guard before
 * any in-app navigation, and the guard decides whether to go on.
 */
import { navigate, useHashLocation } from "wouter/use-hash-location";

/** Asks whether to leave; calls `proceed` to go on. */
export type LeaveGuard = (proceed: () => void) => void;

let guard: LeaveGuard | null = null;

/** Registers the guard of the current page, `null` to remove it. */
export function setLeaveGuard(next: LeaveGuard | null): void {
  guard = next;
}

/** `navigate`, through the registered guard. */
const guarded: typeof navigate = (to, options) => {
  if (guard === null) navigate(to, options);
  else guard(() => navigate(to, options));
};

/** The router's location hook: the hash location, its navigation through the leave guard. */
export const useGuardedHashLocation = (options?: { ssrPath?: string }): [string, typeof navigate] => [useHashLocation(options)[0], guarded];
// Links render `#/…` hrefs, as with the hash location itself.
useGuardedHashLocation.hrefs = (href: string): string => `#${href}`;
