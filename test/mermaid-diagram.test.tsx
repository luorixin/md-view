import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import {
  MERMAID_SECURITY_LEVEL,
  MermaidDiagramView,
} from "../src/components/mermaid-diagram";

test("uses a conservative Mermaid security level", () => {
  assert.equal(MERMAID_SECURITY_LEVEL, "strict");
});

test("renders Mermaid toolbar and loading fallback", () => {
  const html = renderToStaticMarkup(
    <MermaidDiagramView
      chart="sequenceDiagram\nA->>B: hello"
      copyState="idle"
      expanded={false}
      showSource={false}
      svg=""
    />,
  );

  assert.match(html, /mermaid-toolbar/);
  assert.match(html, /复制源码/);
  assert.match(html, /重新渲染/);
  assert.match(html, /查看原文/);
  assert.match(html, /Mermaid 图表加载中/);
});

test("renders Mermaid svg output when render succeeds", () => {
  const html = renderToStaticMarkup(
    <MermaidDiagramView
      chart="graph TD; A-->B;"
      copyState="idle"
      expanded={false}
      showSource={false}
      svg="<svg><text>ok</text></svg>"
    />,
  );

  assert.match(html, /<svg><text>ok<\/text><\/svg>/);
});

test("renders Mermaid source and error fallback", () => {
  const html = renderToStaticMarkup(
    <MermaidDiagramView
      chart="broken"
      copyState="idle"
      error="Parse error"
      expanded
      showSource
      svg=""
    />,
  );

  assert.match(html, /mermaid-expanded/);
  assert.match(html, /Mermaid 图表渲染失败/);
  assert.match(html, /Parse error/);
  assert.match(html, /broken/);
});
