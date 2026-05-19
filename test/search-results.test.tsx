import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { SearchResults } from "../src/components/search-results";
import type { SearchResult } from "../src/lib/search";

const sampleResult = {
  content: "React Fiber scheduler",
  href: "/react/fiber",
  matches: ["fiber"],
  module: "react",
  moduleTitle: "React",
  score: 12,
  slug: "fiber",
  snippet: "React Fiber scheduler",
  title: "Fiber overview",
} satisfies SearchResult;

test("renders compact search results shared by sidebar search", () => {
  const html = renderToStaticMarkup(
    <SearchResults results={[sampleResult]} terms={["fiber"]} variant="compact" />,
  );

  assert.match(html, /class="search-results"/);
  assert.match(html, /class="search-result"/);
  assert.match(html, /<mark>Fiber<\/mark>/);
});

test("renders page search results with an accessible label", () => {
  const html = renderToStaticMarkup(
    <SearchResults results={[sampleResult]} terms={["fiber"]} variant="page" />,
  );

  assert.match(html, /aria-label="搜索结果列表"/);
  assert.match(html, /class="search-page-result"/);
});

test("renders empty search state through the shared component", () => {
  const html = renderToStaticMarkup(
    <SearchResults
      emptyMessage="没有找到匹配文档"
      results={[]}
      terms={["missing"]}
      variant="compact"
    />,
  );

  assert.match(html, /没有找到匹配文档/);
});
