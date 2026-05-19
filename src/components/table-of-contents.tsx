"use client";

import { useEffect, useState } from "react";

import type { TableOfContentsItem } from "@/lib/docs";
import { pickActiveTocId, type TocVisibilityEntry } from "@/lib/toc";

type TableOfContentsProps = {
  items: TableOfContentsItem[];
};

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const orderedIds = items.map((item) => item.id);
    const visibility = new Map<string, TocVisibilityEntry>();

    function updateActiveId() {
      let currentId = items[0]?.id ?? "";

      for (const item of items) {
        const heading = document.getElementById(item.id);

        if (!heading) {
          continue;
        }

        if (heading.getBoundingClientRect().top <= 140) {
          currentId = item.id;
          continue;
        }

        break;
      }

      setActiveId(currentId);
    }

    if (typeof window.IntersectionObserver === "function") {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            visibility.set(entry.target.id, {
              id: entry.target.id,
              isIntersecting: entry.isIntersecting,
              ratio: entry.intersectionRatio,
            });
          }

          setActiveId((currentId) =>
            pickActiveTocId(orderedIds, Array.from(visibility.values()), currentId),
          );
        },
        {
          rootMargin: "-96px 0px -55% 0px",
          threshold: [0, 0.25, 0.5, 0.75, 1],
        },
      );

      for (const item of items) {
        const heading = document.getElementById(item.id);

        if (heading) {
          observer.observe(heading);
        }
      }

      return () => {
        observer.disconnect();
      };
    }

    updateActiveId();
    window.addEventListener("scroll", updateActiveId, { passive: true });
    window.addEventListener("resize", updateActiveId);

    return () => {
      window.removeEventListener("scroll", updateActiveId);
      window.removeEventListener("resize", updateActiveId);
    };
  }, [items]);

  return (
    <aside className="toc" aria-label="页面目录">
      <h2>本页目录</h2>
      {items.length > 0 ? (
        <ol>
          {items.map((item) => (
            <li className={item.level === 3 ? "nested" : undefined} key={item.id}>
              <a
                aria-current={item.id === activeId ? "location" : undefined}
                className={item.id === activeId ? "current" : undefined}
                href={`#${item.id}`}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p>暂无小节</p>
      )}
    </aside>
  );
}
