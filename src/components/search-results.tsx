import Link from "next/link";

import { highlightSearchText, type SearchResult } from "@/lib/search";

type SearchResultsProps = {
  emptyMessage?: string;
  onNavigate?: () => void;
  results: SearchResult[];
  terms: string[];
  variant: "compact" | "page";
};

export function SearchResults({
  emptyMessage = "没有找到匹配文档",
  onNavigate,
  results,
  terms,
  variant,
}: SearchResultsProps) {
  if (results.length === 0) {
    return <p className="search-empty">{emptyMessage}</p>;
  }

  const listClassName =
    variant === "page" ? "search-page-results-list" : "search-results";
  const itemClassName =
    variant === "page" ? "search-page-result" : "search-result";

  return (
    <div className={listClassName} aria-label="搜索结果列表">
      {results.map((result) => (
        <Link
          className={itemClassName}
          href={result.href}
          key={result.href}
          onClick={onNavigate}
        >
          <span>{result.moduleTitle}</span>
          {variant === "page" ? (
            <h2
              dangerouslySetInnerHTML={{
                __html: highlightSearchText(result.title, terms),
              }}
            />
          ) : (
            <strong
              dangerouslySetInnerHTML={{
                __html: highlightSearchText(result.title, terms),
              }}
            />
          )}
          <p
            dangerouslySetInnerHTML={{
              __html: highlightSearchText(result.snippet, terms),
            }}
          />
          <small>{result.matches.join(" · ")}</small>
        </Link>
      ))}
    </div>
  );
}
