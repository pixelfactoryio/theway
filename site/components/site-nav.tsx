import Link from 'next/link';
import { SearchTrigger } from 'fumadocs-ui/layouts/shared/slots/search-trigger';
import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import { Wordmark } from '@/components/wordmark';
import { githubUrl } from '@/lib/layout.shared';
import { column, mono } from '@/lib/site';

const cell = 'flex items-center border-l px-3 md:px-5';
const link = `${cell} ${mono} text-fd-muted-foreground transition-colors hover:text-fd-foreground`;

/* The landing nav: a row of bordered cells inside the frame. */
export function SiteNav() {
  return (
    <header className="border-b">
      <nav aria-label="Main" className={`${column} flex h-14 border-x border-dashed`}>
        <Link href="/" className="flex flex-1 items-center px-3 md:px-5">
          <Wordmark />
        </Link>
        <Link href="/docs/" className={link}>
          Docs
        </Link>
        <a href={githubUrl} className={link}>
          GitHub
        </a>
        <div className={`${cell} gap-1`}>
          <SearchTrigger hideIfDisabled color="ghost" size="icon-sm" />
          <ThemeSwitch />
        </div>
      </nav>
    </header>
  );
}
