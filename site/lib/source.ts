import { defineDocs } from 'fumadocs-mdx/macro';
import { applyMdxPreset } from 'fumadocs-mdx/config';
import { loader } from 'fumadocs-core/source';
import { codeTheme } from './code-theme';

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    // Fumadocs' preset, with code blocks in the dashboard's code colours: one theme for both, its tokens switch.
    mdxOptions: applyMdxPreset({ rehypeCodeOptions: { themes: { light: codeTheme, dark: codeTheme } } }),
  },
});

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
