/**
 * The message a save leaves: `Saved <name>` with what it affects and a Versions link, in a status region at the
 * bottom of the page for about 6 seconds. The region stays in the page, so a screen reader reads each new message.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Link } from "wouter";
import { type FileRef, versionsHref } from "@/lib/api";

/** A saved file and what the save affects. */
type Saved = { file: FileRef; affects: string; at: number };

const SavedContext = createContext<((file: FileRef, affects: string) => void) | null>(null);

/** How long the message shows. */
const SHOWN_MS = 6000;

export function SavedProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const show = useCallback((file: FileRef, affects: string) => setSaved({ file, affects, at: Date.now() }), []);
  useEffect(() => {
    if (saved === null) return;
    const timer = setTimeout(() => setSaved(null), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [saved]);
  return (
    <SavedContext.Provider value={show}>
      {children}
      <div role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {saved !== null && (
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-invert px-4 py-2.5 text-invert-foreground shadow-lg">
            <span className="min-w-0 break-words">
              Saved <span className="font-mono">{saved.file.name}</span> · {saved.affects}
            </span>
            <Link href={versionsHref(saved.file)} className="font-medium underline underline-offset-2" onClick={() => setSaved(null)}>
              Versions
            </Link>
          </div>
        )}
      </div>
    </SavedContext.Provider>
  );
}

/** Shows the saved message of `file`. */
export function useSaved(): (file: FileRef, affects: string) => void {
  const show = useContext(SavedContext);
  if (show === null) throw new Error("useSaved outside SavedProvider");
  return show;
}
