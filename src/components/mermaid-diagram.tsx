"use client";

import { useEffect, useId, useState } from "react";

type MermaidDiagramProps = {
  chart: string;
};

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const reactId = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          securityLevel: "loose",
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

        const diagramId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
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
  }, [chart, reactId]);

  if (error) {
    return (
      <figure className="mermaid-diagram mermaid-error">
        <figcaption>Mermaid 图表渲染失败</figcaption>
        <pre>
          <code>{chart}</code>
        </pre>
        <p>{error}</p>
      </figure>
    );
  }

  return (
    <figure className="mermaid-diagram">
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <pre>
          <code>{chart}</code>
        </pre>
      )}
    </figure>
  );
}
