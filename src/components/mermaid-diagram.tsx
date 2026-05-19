"use client";

import { useEffect, useId, useState } from "react";

type MermaidDiagramProps = {
  chart: string;
};

type CopyState = "idle" | "copied" | "error";

type MermaidDiagramViewProps = {
  chart: string;
  copyState: CopyState;
  error?: string | null;
  expanded: boolean;
  onCopy?: () => void;
  onRerender?: () => void;
  onToggleExpanded?: () => void;
  onToggleSource?: () => void;
  showSource: boolean;
  svg: string;
};

export const MERMAID_SECURITY_LEVEL = "strict";

let mermaidLoader:
  | Promise<typeof import("mermaid").default>
  | null = null;

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const reactId = useId();
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [expanded, setExpanded] = useState(false);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [renderNonce, setRenderNonce] = useState(0);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = await getMermaid();

        const diagramId = `mermaid-${reactId.replace(
          /[^a-zA-Z0-9_-]/g,
          "",
        )}-${renderNonce}`;
        const result = await mermaid.render(diagramId, chart);

        if (!cancelled) {
          setSvg(result.svg);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setSvg("");
          setError(caught instanceof Error ? caught.message : "Mermaid 渲染失败");
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, reactId, renderNonce]);

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyState]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(chart);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <MermaidDiagramView
      chart={chart}
      copyState={copyState}
      error={error}
      expanded={expanded}
      onCopy={handleCopy}
      onRerender={() => {
        setSvg("");
        setError(null);
        setRenderNonce((value) => value + 1);
      }}
      onToggleExpanded={() => setExpanded((value) => !value)}
      onToggleSource={() => setShowSource((value) => !value)}
      showSource={showSource}
      svg={svg}
    />
  );
}

export function MermaidDiagramView({
  chart,
  copyState,
  error,
  expanded,
  onCopy,
  onRerender,
  onToggleExpanded,
  onToggleSource,
  showSource,
  svg,
}: MermaidDiagramViewProps) {
  const figureClassName = [
    "mermaid-diagram",
    error ? "mermaid-error" : "",
    expanded ? "mermaid-expanded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <figure className={figureClassName}>
      <div className="mermaid-toolbar">
        <span aria-live="polite" className="copy-status">
          {copyState === "copied"
            ? "已复制"
            : copyState === "error"
              ? "复制失败"
              : ""}
        </span>
        <div>
          <button type="button" onClick={onCopy}>
            复制源码
          </button>
          <button type="button" onClick={onRerender}>
            重新渲染
          </button>
          <button type="button" onClick={onToggleSource}>
            {showSource ? "隐藏原文" : "查看原文"}
          </button>
          <button type="button" onClick={onToggleExpanded}>
            {expanded ? "还原" : "放大"}
          </button>
        </div>
      </div>
      {error ? (
        <>
          <figcaption>Mermaid 图表渲染失败</figcaption>
          <p>{error}</p>
        </>
      ) : svg ? (
        <div
          className="mermaid-svg"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <p className="mermaid-loading">Mermaid 图表加载中</p>
      )}
      {showSource || error ? (
        <pre className="mermaid-source">
          <code>{chart}</code>
        </pre>
      ) : null}
    </figure>
  );
}

async function getMermaid() {
  if (!mermaidLoader) {
    mermaidLoader = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        securityLevel: MERMAID_SECURITY_LEVEL,
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          primaryColor: "#fffdf8",
          primaryTextColor: "#20221f",
          primaryBorderColor: "#1f7a68",
          lineColor: "#62665f",
          secondaryColor: "#f0eee7",
          tertiaryColor: "#f7f4ee",
          actorBorder: "#1f7a68",
          actorTextColor: "#20221f",
          actorBkg: "#fffdf8",
          signalColor: "#62665f",
          signalTextColor: "#20221f",
        },
      });

      return mermaid;
    });
  }

  return mermaidLoader;
}
