import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const tagline =
  'theway writes a spec and an ordered task list before any code, then implements the tasks in your session or through agents that open a reviewed, CI-green pull request.';

export const title = 'theway · A spec-first workflow for Claude Code';

/* The site's one host and base path; every canonical and sharing URL is absolute, with the trailing slash the export serves. */
export const siteUrl = 'https://pixelfactoryio.github.io/theway';

export function pageUrl(path: string): string {
  return `${siteUrl}${path.replace(/\/?$/, '/')}`;
}

/* The share card every page carries (public/og.png): Next replaces a parent's `openGraph` whole, so each page spreads it. */
export const openGraphBase = {
  siteName: 'theway',
  type: 'website' as const,
  images: [{ url: `${siteUrl}/og.png`, width: 1200, height: 630, alt: title }],
};

export const installCommand = 'npx --yes @pixelfactoryio/theway@latest install';

/* The released version, read at build time from the repository's package.json (site/ builds from the repository). */
export function version(): string {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), '..', 'package.json'), 'utf-8')) as { version?: unknown };
  if (typeof pkg.version !== 'string') throw new Error('../package.json has no version');
  return pkg.version;
}

/* The column: 16px from the screen edges up to 768px, 48px from there, at most 1344px of content, centred. */
export const column = 'mx-auto w-full max-w-[calc(84rem+6rem)] px-4 md:px-12';
