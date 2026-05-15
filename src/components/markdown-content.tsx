import { Children, type ReactElement, type ReactNode } from "react";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { createHeadingSlugger } from "@/lib/docs";
import { getCodeLanguage, isMermaidLanguage } from "@/lib/markdown-code";

import { MermaidDiagram } from "./mermaid-diagram";

type MarkdownContentProps = {
  content: string;
};

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("text", plaintext);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);

export function MarkdownContent({ content }: MarkdownContentProps) {
  const headingSlug = createHeadingSlugger();

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2({ children }) {
            const id = headingSlug(childrenToText(children));

            return <h2 id={id}>{children}</h2>;
          },
          h3({ children }) {
            const id = headingSlug(childrenToText(children));

            return <h3 id={id}>{children}</h3>;
          },
          a({ children, href }) {
            return (
              <a href={href} rel="noreferrer" target={isExternalHref(href) ? "_blank" : undefined}>
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="table-scroll">
                <table>{children}</table>
              </div>
            );
          },
          code({ children, className }) {
            const code = childrenToText(children);
            const language = getCodeLanguage(className);

            if (!language) {
              return <code>{children}</code>;
            }

            if (isMermaidLanguage(language)) {
              return <MermaidDiagram chart={code.trim()} />;
            }

            return (
              <code
                className={`hljs language-${language}`}
                dangerouslySetInnerHTML={{
                  __html: highlightCode(code, language),
                }}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function highlightCode(code: string, language: string): string {
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(code, { language }).value;
  }

  return hljs.highlightAuto(code).value;
}

function childrenToText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }

      if (isReactElementWithChildren(child)) {
        return childrenToText(child.props.children);
      }

      return "";
    })
    .join("");
}

function isReactElementWithChildren(
  value: ReactNode,
): value is ReactElement<{ children?: ReactNode }> {
  return typeof value === "object" && value !== null && "props" in value;
}

function isExternalHref(href: string | undefined): boolean {
  return Boolean(href?.startsWith("http://") || href?.startsWith("https://"));
}
