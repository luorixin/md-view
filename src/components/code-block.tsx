"use client";

import { useEffect, useState } from "react";

type CodeBlockProps = {
  code: string;
  highlightedHtml: string;
  language: string;
};

export function CodeBlock({
  code,
  highlightedHtml,
  language,
}: CodeBlockProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

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
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-toolbar">
        <span>{language}</span>
        <div className="code-block-actions">
          <span aria-live="polite" className="copy-status">
            {copyState === "copied"
              ? "已复制"
              : copyState === "error"
                ? "复制失败"
                : ""}
          </span>
          <button type="button" onClick={handleCopy}>
            复制代码
          </button>
        </div>
      </div>
      <pre>
        <code
          className={`hljs language-${language}`}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </div>
  );
}
