/** The scroll offsets the shell keeps per address. Pure: no React, no DOM. */

/** The address an offset is kept for: the search part and the hash. */
export const addressOf = (search: string, hash: string): string => `${search}${hash}`;

/**
 * The offsets kept per address, and the restore Back or Forward leaves pending. `navigate` records a navigation:
 * from Back or Forward (`traversal`) it makes the pending restore the offset kept for the new address (0 when none), otherwise it drops
 * any pending restore.
 */
export class ScrollMemory {
  private readonly offsets = new Map<string, number>();
  pending: { address: string; top: number } | null = null;

  save(address: string, top: number): void {
    this.offsets.set(address, top);
  }

  kept(address: string): number | undefined {
    return this.offsets.get(address);
  }

  navigate(address: string, traversal: boolean): void {
    this.pending = traversal ? { address, top: this.offsets.get(address) ?? 0 } : null;
  }
}
