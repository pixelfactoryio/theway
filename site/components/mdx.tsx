import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { InlineCode } from '@/lib/inline-code';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    code: InlineCode,
    ...components,
  } satisfies MDXComponents;
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
