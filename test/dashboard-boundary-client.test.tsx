import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { resetOnKeyChange } from "../src/dashboard/client/lib/boundary";
import { ErrorBoundary, PageError, RootError } from "../src/dashboard/client/shell/error-boundary";

test("a boundary clears its error only when its key changes", () => {
  expect(resetOnKeyChange("/a", "/b", false)).toBe(false);
  expect(resetOnKeyChange("/a", "/a", true)).toBe(false);
  expect(resetOnKeyChange("/a", "/b", true)).toBe(true);
  expect(resetOnKeyChange(undefined, "/a", true)).toBe(true);
});

test("a boundary keeps an error caught in the update that changed its key, and clears one shown before it", () => {
  const fallback = () => null;
  const error = new Error("x");
  const boundary = new ErrorBoundary({ children: null, resetKey: "/b", fallback });
  boundary.state = { error };
  const cleared: unknown[] = [];
  boundary.setState = ((next: unknown) => cleared.push(next)) as typeof boundary.setState;

  // Navigating from /a to a page that throws: the error was caught in this update, so it stays.
  boundary.componentDidUpdate({ children: null, resetKey: "/a", fallback }, { error: null });
  expect(cleared).toEqual([]);

  // Navigating from /a, where the error showed, to /b: it clears.
  boundary.componentDidUpdate({ children: null, resetKey: "/a", fallback }, { error });
  expect(cleared).toEqual([{ error: null }]);
});

test("a caught error becomes the boundary's state, a thrown non-Error as an Error", () => {
  const error = new Error("x");
  expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
  expect(ErrorBoundary.getDerivedStateFromError(error).error).toBe(error);
  const wrapped = ErrorBoundary.getDerivedStateFromError("s").error;
  expect(wrapped).toBeInstanceOf(Error);
  expect(wrapped.message).toBe("s");
});

test("the page fallback shows the error and Try again", () => {
  // TopBar reads the query client and the route before finding no slot, so the page renders inside both providers.
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <Router ssrPath="/">
        <PageError error={new Error("boom")} reset={() => {}} />
      </Router>
    </QueryClientProvider>,
  );
  expect(html).toContain("This page failed to render");
  expect(html).toContain("boom");
  expect(html).toContain("Try again");
});

test("the root fallback shows the error and Reload", () => {
  const html = renderToStaticMarkup(<RootError error={new Error("boom")} />);
  expect(html).toContain("The dashboard failed to render");
  expect(html).toContain("boom");
  expect(html).toContain("Reload");
});
