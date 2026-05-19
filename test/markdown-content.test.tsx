import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownContent } from "../src/components/markdown-content";

test("renders anchor links for section headings", () => {
  const html = renderToStaticMarkup(
    <MarkdownContent content={"## Intro Section\n\nA paragraph."} />,
  );

  assert.match(html, /id="intro-section"/);
  assert.match(html, /href="#intro-section"/);
  assert.match(html, /heading-anchor/);
  assert.match(html, /Intro Section/);
});

test("renders code block toolbar controls for fenced code blocks", () => {
  const html = renderToStaticMarkup(
    <MarkdownContent content={"```ts\nconst answer = 42;\n```"} />,
  );

  assert.match(html, /code-block/);
  assert.match(html, /复制代码/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /ts/);
});
