import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { getSearchIndex } from "../src/lib/docs";
import { getSearchPageHref, normalizeQuery, searchDocs } from "../src/lib/search";

const DOCS_DIR = path.join(process.cwd(), "docs");

test("builds a full-text search index from every markdown document", () => {
  const index = getSearchIndex();

  assert.equal(index.length, getExpectedMarkdownTotal());
  assert.equal(
    index.some((item) => item.href === "/react/react-source-overview"),
    true,
  );
  assert.equal(
    index.some((item) => item.href === "/element-plus/element-plus-button-source"),
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

function getExpectedMarkdownTotal(): number {
  return fs
    .readdirSync(DOCS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .reduce((total, entry) => {
      const markdownCount = fs
        .readdirSync(path.join(DOCS_DIR, entry.name), { withFileTypes: true })
        .filter((docEntry) => docEntry.isFile() && docEntry.name.endsWith(".md"))
        .length;

      return total + markdownCount;
    }, 0);
}
