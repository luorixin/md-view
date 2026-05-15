import Link from "next/link";

import type { AdjacentDocs } from "@/lib/docs";

type AdjacentDocNavProps = {
  adjacentDocs: AdjacentDocs;
};

export function AdjacentDocNav({ adjacentDocs }: AdjacentDocNavProps) {
  if (!adjacentDocs.previous && !adjacentDocs.next) {
    return null;
  }

  return (
    <nav className="adjacent-doc-nav" aria-label="文章翻页">
      {adjacentDocs.previous ? (
        <Link className="adjacent-doc previous" href={adjacentDocs.previous.href}>
          <span>上一篇</span>
          <strong>{adjacentDocs.previous.title}</strong>
        </Link>
      ) : (
        <div aria-hidden="true" />
      )}
      {adjacentDocs.next ? (
        <Link className="adjacent-doc next" href={adjacentDocs.next.href}>
          <span>下一篇</span>
          <strong>{adjacentDocs.next.title}</strong>
        </Link>
      ) : (
        <div aria-hidden="true" />
      )}
    </nav>
  );
}
