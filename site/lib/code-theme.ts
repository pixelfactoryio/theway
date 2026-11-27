import type { ThemeRegistration } from 'shiki/core';

/*
 * The docs' code blocks in the dashboard's code colours (src/dashboard/client/lib/code-languages.ts, CODE_TAG_STYLES):
 * every token names a `--code-*` token of app/global.css, so one theme follows light and dark. YAML is coloured as
 * the dashboard's YAML is: keys in the property colour, quoted strings in the string colour, plain values in the ink.
 */
const color = (token: string) => `var(--code-${token})`;

export const codeTheme: ThemeRegistration = {
  name: 'dashboard',
  type: 'light',
  colors: { 'editor.foreground': 'var(--foreground)', 'editor.background': 'transparent' },
  tokenColors: [
    { settings: { foreground: 'var(--foreground)' } },
    {
      scope: ['keyword', 'storage.type', 'storage.modifier', 'keyword.operator', 'markup.deleted'],
      settings: { foreground: color('keyword') },
    },
    { scope: ['string', 'string.regexp', 'constant.character'], settings: { foreground: color('string') } },
    {
      scope: ['constant.numeric', 'constant.language', 'constant.other', 'variable.other.constant', 'markup.underline.link'],
      settings: { foreground: color('constant') },
    },
    {
      scope: ['entity.name.function', 'support.function', 'meta.preprocessor'],
      settings: { foreground: color('function') },
    },
    {
      scope: ['entity.name.type', 'entity.name.class', 'entity.name.namespace', 'entity.other.inherited-class', 'support.class', 'variable.language.this'],
      settings: { foreground: color('type') },
    },
    {
      scope: [
        'entity.name.tag',
        'support.type.property-name',
        'entity.other.attribute-name',
        'meta.object-literal.key',
        'variable.other.property',
        'markup.inserted',
      ],
      settings: { foreground: color('property') },
    },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: color('comment'), fontStyle: 'italic' } },
    {
      scope: ['source.yaml string.unquoted', 'source.yaml constant.language', 'source.yaml constant.numeric'],
      settings: { foreground: 'var(--foreground)' },
    },
    { scope: ['markup.heading', 'markup.bold'], settings: { fontStyle: 'bold' } },
    { scope: 'markup.italic', settings: { fontStyle: 'italic' } },
  ],
};
