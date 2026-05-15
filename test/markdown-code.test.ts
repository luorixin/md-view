import assert from "node:assert/strict";
import test from "node:test";

import { getCodeLanguage, isMermaidLanguage } from "../src/lib/markdown-code";

test("extracts markdown code fence language from className", () => {
  assert.equal(getCodeLanguage("language-mermaid"), "mermaid");
  assert.equal(getCodeLanguage("hljs language-ts"), "ts");
  assert.equal(getCodeLanguage(undefined), null);
});

test("detects mermaid code blocks", () => {
  assert.equal(isMermaidLanguage("mermaid"), true);
  assert.equal(isMermaidLanguage("mmd"), true);
  assert.equal(isMermaidLanguage("sequenceDiagram"), false);
  assert.equal(isMermaidLanguage(null), false);
});
