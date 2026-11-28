import type { ComponentProps, ReactNode } from 'react';

/*
 * The longest inline code kept whole on one line: 32 characters with its two backticks, as in the dashboard
 * (DESIGN.md, Inline code; src/dashboard/client/components/live-markdown.tsx, WHOLE_CODE). Longer code wraps anywhere.
 */
const WHOLE_CODE = 32 - 2;

/* The class that keeps a short inline code whole: `whole` when its text has at most WHOLE_CODE characters. */
export function wholeClass(children: ReactNode): string | undefined {
  return typeof children === 'string' && children.length <= WHOLE_CODE ? 'whole' : undefined;
}

/* Inline code in the prose: a code block's `code` holds its lines as elements, so it never takes the class. */
export function InlineCode({ className, children, ...props }: ComponentProps<'code'>) {
  const whole = wholeClass(children);
  return (
    <code {...props} className={whole && className ? `${className} ${whole}` : (whole ?? className)}>
      {children}
    </code>
  );
}

/* A description with its code between backticks, as in Markdown: each backtick span as `<code>`, the rest as text. */
export function inlineCode(text: string): ReactNode[] {
  return text.split('`').map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className={wholeClass(part)}>
        {part}
      </code>
    ) : (
      part
    ),
  );
}

/* The same description as plain text, for the meta tags. */
export function plainText(text: string): string {
  return text.replaceAll('`', '');
}
