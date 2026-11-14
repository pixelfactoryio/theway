/** The error boundaries' reset rule. Pure: no React, no DOM. */

/**
 * Whether a boundary clears its error: only when it already showed one before this update (`hadError`) and its reset
 * key changed (another path for the page boundary).
 */
export function resetOnKeyChange(prev: string | undefined, next: string | undefined, hadError: boolean): boolean {
  return hadError && prev !== next;
}
