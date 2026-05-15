import assert from "node:assert/strict";
import test from "node:test";

import { getSearchIndex } from "../src/lib/docs";
import { getSearchPageHref, normalizeQuery, searchDocs } from "../src/lib/search";

test("builds a full-text search index from every markdown document", () => {
  const index = getSearchIndex();

  assert.equal(index.length, 51);
  assert.equal(
    index.some((item) => item.href === "/react/react-source-overview"),
    true,
  );
  assert.equal(index.some((item) => item.content.includes("# ")), false);
});

test("searches title and content with title matches ranked first", () => {
  const results = searchDocs(getSearchIndex(), {
    query: "hydration",
    module: "all",
  });

  assert.equal(results.length > 0, true);
  assert.equal(results[0].title.toLowerCase().includes("hydration"), true);
  assert.equal(results[0].matches.length > 0, true);
  assert.equal(results[0].snippet.length > 0, true);
});

test("filters search results by module", () => {
  const results = searchDocs(getSearchIndex(), {
    query: "hydration",
    module: "vue",
  });

  assert.equal(results.length > 0, true);
  assert.equal(results.every((result) => result.module === "vue"), true);
});

test("supports multi-term searches", () => {
  const results = searchDocs(getSearchIndex(), {
    query: "react fiber",
    module: "react",
  });

  assert.equal(results.length > 0, true);
  assert.equal(results[0].matches.includes("react"), true);
  assert.equal(results[0].matches.includes("fiber"), true);
});

test("normalizes repeated and padded search terms", () => {
  assert.deepEqual(normalizeQuery("  React   react   Fiber "), ["react", "fiber"]);
});

test("builds shareable search result urls", () => {
  assert.equal(
    getSearchPageHref({ query: "react fiber", module: "react" }),
    "/search?q=react%20fiber&module=react",
  );
  assert.equal(getSearchPageHref({ query: "hydration", module: "all" }), "/search?q=hydration");
});
