import Link from 'next/link';
import { SearchTrigger } from 'fumadocs-ui/layouts/shared/slots/search-trigger';
import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import { Wordmark } from '@/components/wordmark';
import { githubUrl } from '@/lib/layout.shared';
import { column, version } from '@/lib/site';

const link = 'rounded-md px-2 py-1 text-ui text-dim transition-colors hover:text-ink';

/* The home page's nav on the ground: the logo and the docs' main entries, then the version, search, theme and GitHub. */
export function SiteNav() {
  return (
    <header>
      <nav aria-label="Main" className={`${column} flex h-14 items-center gap-4`}>
        <Link href="/" aria-label="theway home" className="mr-2">
          <Wordmark />
        </Link>
        <div className="hidden items-center gap-1 sm:flex">
          <Link href="/docs/" className={link}>
            Docs
          </Link>
          <Link href="/docs/concepts/workflows/" className={link}>
            Workflows
          </Link>
          <Link href="/docs/commands/engineering/" className={link}>
            Commands
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={`${githubUrl}/releases/tag/v${version()}`}
            className="hidden font-mono text-[13px] text-dim transition-colors hover:text-ink md:inline"
          >
            v{version()}
          </a>
          <SearchTrigger hideIfDisabled color="ghost" size="icon-sm" />
          <ThemeSwitch />
          <a href={githubUrl} className={link}>
            GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}
