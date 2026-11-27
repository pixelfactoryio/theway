'use client';
import { Check, Copy } from 'lucide-react';
import { useCopyButton } from 'fumadocs-ui/utils/use-copy-button';

/* The install command on the panel, with its copy button; the dashboard's 40px field with a hairline and 8px corners. */
export function InstallPill({ command, className = '' }: { command: string; className?: string }) {
  const [checked, onClick] = useCopyButton(() => navigator.clipboard.writeText(command));

  return (
    <div
      className={`flex min-h-10 min-w-0 items-center gap-2.5 rounded-lg py-1 border border-line bg-panel pl-3.5 pr-1 font-mono text-[13px] ${className}`}
    >
      <span aria-hidden="true" className="select-none text-dim">
        $
      </span>
      <code className="min-w-0 sm:whitespace-nowrap">{command}</code>
      <button
        type="button"
        onClick={onClick}
        aria-label={checked ? 'Copied' : 'Copy the install command'}
        className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-md text-dim transition-colors hover:bg-hover hover:text-ink"
      >
        {checked ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
