'use client';
import { useEffect, useRef } from 'react';
import { useSidebar } from 'fumadocs-ui/components/sidebar/base';

const collapsedKey = 'theway-docs-sidebar-collapsed';
const focusable = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/*
 * What Fumadocs' docs layout leaves out, added from its sidebar state; it renders nothing.
 * - The phone's drawer is a dialog: while it is open, everything else in the layout is inert and the focus moves into
 *   it; on close the focus goes back to the header's button that opens it.
 * - The sidebar's collapse is kept per browser across reloads.
 */
export function DocsChrome() {
  const { open, mode, collapsed, setCollapsed } = useSidebar();
  const restored = useRef(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(collapsedKey) === 'true') setCollapsed(true);
    } catch {}
    restored.current = true;
  }, [setCollapsed]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(collapsedKey, String(collapsed));
    } catch {}
  }, [collapsed]);

  useEffect(() => {
    if (mode !== 'drawer' || !open) return;
    const layout = document.getElementById('nd-docs-layout');
    const drawer = document.getElementById('nd-sidebar-mobile');
    if (!layout || !drawer) return;
    // Every part of the layout but the drawer and its overlay (the empty `data-state` element that closes it on a click).
    const behind = Array.from(layout.children).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement && el !== drawer && !(el.dataset.state && el.childElementCount === 0),
    );
    for (const el of behind) el.inert = true;
    // The drawer shows (Radix Presence) a frame after it mounts; a hidden element cannot take the focus before that.
    const frame = requestAnimationFrame(() => drawer.querySelector<HTMLElement>(focusable)?.focus());
    return () => {
      cancelAnimationFrame(frame);
      for (const el of behind) el.inert = false;
      if (drawer.contains(document.activeElement) || document.activeElement === document.body) {
        document.querySelector<HTMLElement>('#nd-subnav [aria-controls="nd-sidebar-mobile"]')?.focus();
      }
    };
  }, [mode, open]);

  return null;
}
