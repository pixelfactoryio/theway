import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownView } from "../src/dashboard/client/components/markdown";

/** The task boxes of a rendered Markdown text: each one's item line and whether it can be ticked. */
function boxes(text: string): { line: string; enabled: boolean }[] {
  const html = renderToStaticMarkup(<MarkdownView text={text} onToggle={() => {}} />);
  return [...html.matchAll(/<li [^>]*data-line="(\d+)"><span ([^>]*)role="checkbox"/g)].map(([, line, attrs]) => ({
    line: line ?? "",
    enabled: !(attrs ?? "").includes("data-disabled"),
  }));
}

test("every box of a tight or a loose task list can be ticked and gives its item's line", () => {
  expect(boxes("- [ ] a\n- [x] b\n")).toEqual([
    { line: "1", enabled: true },
    { line: "2", enabled: true },
  ]);
  expect(boxes("- [ ] a\n\n- [x] b\n")).toEqual([
    { line: "1", enabled: true },
    { line: "3", enabled: true },
  ]);
});

test("a loose task item's box is taken out of its paragraph", () => {
  const html = renderToStaticMarkup(<MarkdownView text={"- [ ] a\n\n- [x] b\n"} onToggle={() => {}} />);
  expect(html).not.toMatch(/<p[^>]*>\s*<(input|span)/);
  expect(html).toContain('<p data-line="1"> a</p>');
});
