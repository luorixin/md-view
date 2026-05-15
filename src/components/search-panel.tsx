"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";

import type { DocModule, SearchIndexItem } from "@/lib/docs";
import { highlightSearchText, normalizeQuery, searchDocs } from "@/lib/search";

type SearchPanelProps = {
  modules: DocModule[];
  searchIndex: SearchIndexItem[];
};

export function SearchPanel({ modules, searchIndex }: SearchPanelProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [module, setModule] = useState("all");
  const terms = useMemo(() => normalizeQuery(query), [query]);
  const results = useMemo(
    () => searchDocs(searchIndex, { query, module }).slice(0, 12),
    [module, query, searchIndex],
  );
  const hasQuery = terms.length > 0;

  return (
    <section className="search-panel" aria-label="全文搜索">
      <label htmlFor={inputId}>全文搜索</label>
      <input
        id={inputId}
        name="q"
        placeholder="搜索 Fiber、hydration、scheduler..."
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />
      <div className="search-tools">
        <select
          aria-label="筛选模块"
          name="module"
          value={module}
          onChange={(event) => setModule(event.target.value)}
        >
          <option value="all">全部模块</option>
          {modules.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.title}
            </option>
          ))}
        </select>
        <span>{hasQuery ? `${results.length} 个结果` : "输入关键词"}</span>
      </div>
      <Link
        className="search-open"
        href={`/search?q=${encodeURIComponent(query)}&module=${module}`}
      >
        打开搜索页
      </Link>
      {hasQuery ? (
        <div className="search-results">
          {results.length > 0 ? (
            results.map((result) => (
              <Link className="search-result" href={result.href} key={result.href}>
                <span>{result.moduleTitle}</span>
                <strong
                  dangerouslySetInnerHTML={{
                    __html: highlightSearchText(result.title, terms),
                  }}
                />
                <p
                  dangerouslySetInnerHTML={{
                    __html: highlightSearchText(result.snippet, terms),
                  }}
                />
                <small>{result.matches.join(" · ")}</small>
              </Link>
            ))
          ) : (
            <p className="search-empty">没有找到匹配文档</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
