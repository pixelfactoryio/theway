import { Marked } from "marked";

/** `text` with `&` and `<` escaped, so raw HTML in a Markdown file shows as text. */
const escapeHtml = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

/**
 * The dashboard's Markdown renderer: GitHub-flavoured, with raw HTML (blocks and inline tags) escaped instead of
 * passed through. marked does not sanitize its output; the page's CSP is the second layer.
 */
const marked = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
  },
});

/** The HTML of a Markdown text. */
export function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false });
}

/** The HTML of a Markdown text rendered inline: no paragraph around it, raw HTML escaped. */
export function renderInline(text: string): string {
  return marked.parseInline(text, { async: false });
}
