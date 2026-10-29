import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Paths are relative to site/, where `next build` runs.
const commandsDir = join(process.cwd(), '..', 'plugin', 'commands');
const docsDir = join(process.cwd(), 'content', 'docs', 'commands');

function frontmatterDescription(path: string): string {
  const match = /^---\n[\s\S]*?^description: (.+)$[\s\S]*?^---$/m.exec(readFileSync(path, 'utf-8'));
  if (!match) throw new Error(`${path} has no frontmatter description`);
  return match[1].trim();
}

/**
 * The frontmatter `description` of a plugin command, read at build time.
 * The build fails when the command's docs page subtitle differs from it.
 */
export function commandDescription(name: string): string {
  const description = frontmatterDescription(join(commandsDir, `${name}.md`));
  const subtitle = frontmatterDescription(join(docsDir, `${name}.mdx`));
  if (subtitle !== description) {
    throw new Error(
      `content/docs/commands/${name}.mdx description "${subtitle}" does not match plugin/commands/${name}.md description "${description}"`,
    );
  }
  return description;
}
