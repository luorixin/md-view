import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getAdjacentDocs,
  getAllDocParams,
  getDocPageData,
  getDocModules,
} from "../src/lib/docs";

const DOCS_DIR = path.join(process.cwd(), "docs");

test("builds modules from top-level docs folders and ignores non-markdown files", () => {
  const modules = getDocModules();
  const moduleSlugs = modules.map((module) => module.slug);

  assert.deepEqual(moduleSlugs, getExpectedModuleSlugs());
  assert.deepEqual(
    modules.map((module) => module.docs.length),
    moduleSlugs.map((moduleSlug) => getMarkdownCount(moduleSlug)),
  );
  assert.equal(
    modules.some((module) =>
      module.docs.some((doc) => doc.slug === ".DS_Store"),
    ),
    false,
  );
});

test("extracts readable document metadata from markdown content", () => {
  const modules = getDocModules();
  const reactOverview = modules
    .find((module) => module.slug === "react")
    ?.docs.find((doc) => doc.slug === "react-source-overview");

  assert.equal(reactOverview?.title, "React 源码仓库全局导览");
  assert.equal(
    reactOverview?.href,
    "/react/react-source-overview",
  );

  const elementPlusModule = modules.find((module) => module.slug === "element-plus");
  const buttonDoc = elementPlusModule?.docs.find(
    (doc) => doc.slug === "element-plus-button-source",
  );

  assert.equal(elementPlusModule?.title, "Element Plus");
  assert.equal(buttonDoc?.href, "/element-plus/element-plus-button-source");
});

test("generates static route params for every markdown document", () => {
  const params = getAllDocParams();

  assert.equal(params.length, getExpectedMarkdownTotal());
  assert.deepEqual(
    params.find(
      (param) =>
        param.module === "vue" && param.slug === "vue3-source-guide",
    ),
    { module: "vue", slug: "vue3-source-guide" },
  );
  assert.deepEqual(
    params.find(
      (param) =>
        param.module === "element-plus" &&
        param.slug === "element-plus-button-source",
    ),
    { module: "element-plus", slug: "element-plus-button-source" },
  );
});

test("finds previous and next documents inside the same module", () => {
  const reactModule = getDocModules().find((module) => module.slug === "react");
  assert.ok(reactModule);

  const middleDoc = reactModule.docs[1];
  const adjacent = getAdjacentDocs("react", middleDoc.slug);

  assert.equal(adjacent.previous?.slug, reactModule.docs[0].slug);
  assert.equal(adjacent.next?.slug, reactModule.docs[2].slug);
});

test("returns empty adjacent slots for missing or edge documents", () => {
  const reactModule = getDocModules().find((module) => module.slug === "react");
  assert.ok(reactModule);

  const firstAdjacent = getAdjacentDocs("react", reactModule.docs[0].slug);
  const lastAdjacent = getAdjacentDocs(
    "react",
    reactModule.docs[reactModule.docs.length - 1].slug,
  );
  const missingAdjacent = getAdjacentDocs("react", "missing-doc");

  assert.equal(firstAdjacent.previous, null);
  assert.equal(firstAdjacent.next?.slug, reactModule.docs[1].slug);
  assert.equal(lastAdjacent.previous?.slug, reactModule.docs.at(-2)?.slug);
  assert.equal(lastAdjacent.next, null);
  assert.deepEqual(missingAdjacent, { previous: null, next: null });
});

test("builds all document page data in one read model", () => {
  const reactModule = getDocModules().find((module) => module.slug === "react");
  assert.ok(reactModule);

  const doc = reactModule.docs[1];
  const pageData = getDocPageData("react", doc.slug);

  assert.ok(pageData);
  assert.equal(pageData.activeModule.slug, "react");
  assert.equal(pageData.doc.slug, doc.slug);
  assert.equal(pageData.modules.length, getExpectedModuleSlugs().length);
  assert.equal(pageData.searchIndex.length, getExpectedMarkdownTotal());
  assert.equal(pageData.adjacentDocs.previous?.slug, reactModule.docs[0].slug);
});

function getExpectedModuleSlugs(): string[] {
  return fs
    .readdirSync(DOCS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .filter((moduleSlug) => getMarkdownCount(moduleSlug) > 0)
    .sort((a, b) => a.localeCompare(b));
}

function getExpectedMarkdownTotal(): number {
  return getExpectedModuleSlugs().reduce(
    (total, moduleSlug) => total + getMarkdownCount(moduleSlug),
    0,
  );
}

function getMarkdownCount(moduleSlug: string): number {
  return fs
    .readdirSync(path.join(DOCS_DIR, moduleSlug), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .length;
}
