'use client';
import { Check, Copy } from 'lucide-react';
import { useCopyButton } from 'fumadocs-ui/utils/use-copy-button';

export function InstallPill({ command }: { command: string }) {
  const [checked, onClick] = useCopyButton(() => navigator.clipboard.writeText(command));

  return (
    <div className="flex min-h-10 max-w-full items-center gap-2 border bg-fd-background py-1 pl-4 pr-1 font-mono text-code">
      <span aria-hidden="true" className="select-none text-fd-muted-foreground">
        $
      </span>
      <code className="min-w-0 whitespace-normal">{command}</code>
      <button
        type="button"
        onClick={onClick}
        aria-label={checked ? 'Copied' : 'Copy the install command'}
        className="flex size-8 shrink-0 items-center justify-center text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
      >
        {checked ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
