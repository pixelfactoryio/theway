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
