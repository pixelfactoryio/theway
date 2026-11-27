import type { ReactNode } from 'react';

/* A description with its code between backticks, as in Markdown: each backtick span as `<code>`, the rest as text. */
export function inlineCode(text: string): ReactNode[] {
  return text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part));
}

/* The same description as plain text, for the meta tags. */
export function plainText(text: string): string {
  return text.replaceAll('`', '');
}
