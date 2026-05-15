import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdjacentDocs,
  getAllDocParams,
  getDocPageData,
  getDocModules,
} from "../src/lib/docs";

test("builds modules from top-level docs folders and ignores non-markdown files", () => {
  const modules = getDocModules();
  const moduleSlugs = modules.map((module) => module.slug);

  assert.deepEqual(moduleSlugs, ["react", "vue"]);
  assert.equal(modules[0].docs.length, 22);
  assert.equal(modules[1].docs.length, 29);
  assert.equal(
    modules[0].docs.some((doc) => doc.slug === ".DS_Store"),
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
});

test("generates static route params for every markdown document", () => {
  const params = getAllDocParams();

  assert.equal(params.length, 51);
  assert.deepEqual(
    params.find(
      (param) =>
        param.module === "vue" && param.slug === "vue3-source-guide",
    ),
    { module: "vue", slug: "vue3-source-guide" },
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
  assert.equal(pageData.modules.length, 2);
  assert.equal(pageData.searchIndex.length, 51);
  assert.equal(pageData.adjacentDocs.previous?.slug, reactModule.docs[0].slug);
});
