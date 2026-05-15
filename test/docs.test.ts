import assert from "node:assert/strict";
import test from "node:test";

import { getAllDocParams, getDocModules } from "../src/lib/docs";

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
