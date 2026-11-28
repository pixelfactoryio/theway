import { defineDocs } from 'fumadocs-mdx/macro';
import { applyMdxPreset } from 'fumadocs-mdx/config';
import { loader } from 'fumadocs-core/source';
import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins';
import type { ShikiTransformer } from 'shiki/core';
import { codeTheme } from './code-theme';

/*
 * Every code block gets a head (DESIGN.md, Docs code block): a block with no `title` takes its fence's language as
 * one, so Fumadocs draws its head with the copy button in it, off the code. A fence with no language reads "text".
 */
const languageTitle: ShikiTransformer = {
  name: 'language-title',
  pre(node) {
    node.properties.title ??= this.options.lang === 'plaintext' ? 'text' : this.options.lang;
  },
};

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    // Fumadocs' preset, with code blocks in the dashboard's code colours: one theme for both, its tokens switch.
    mdxOptions: applyMdxPreset({
      rehypeCodeOptions: {
        themes: { light: codeTheme, dark: codeTheme },
        transformers: [...(rehypeCodeDefaultOptions.transformers ?? []), languageTitle],
      },
    }),
  },
});

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
