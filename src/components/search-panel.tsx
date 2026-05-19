"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";

import type { DocModule, SearchIndexItem } from "@/lib/docs";
import {
  getSearchPageHref,
  normalizeQuery,
  searchDocs,
} from "@/lib/search";

import { SearchResults } from "./search-results";

type SearchPanelProps = {
  enableShortcuts?: boolean;
  modules: DocModule[];
  onNavigate?: () => void;
  searchIndex: SearchIndexItem[];
};

export function SearchPanel({
  enableShortcuts = false,
  modules,
  onNavigate,
  searchIndex,
}: SearchPanelProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [module, setModule] = useState("all");
  const deferredQuery = useDeferredValue(query);
  const terms = normalizeQuery(deferredQuery);
  const results = searchDocs(searchIndex, {
    query: deferredQuery,
    module,
  }).slice(0, 12);
  const hasQuery = terms.length > 0;
  const searchHref = getSearchPageHref({ query, module });

  const focusSearchInput = useEffectEvent(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  });

  useEffect(() => {
    if (!enableShortcuts) {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLTextAreaElement);

      if (isTypingTarget) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearchInput();
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        focusSearchInput();
      }
    }

    window.addEventListener("keydown", handleKeydown);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [enableShortcuts, focusSearchInput]);

  return (
    <section className="search-panel" aria-label="全文搜索">
      <label htmlFor={inputId}>全文搜索</label>
      <input
        id={inputId}
        ref={inputRef}
        name="q"
        placeholder="搜索源码、组件、scheduler..."
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
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
        <span aria-live="polite">
          {hasQuery
            ? `${results.length} 个结果`
            : enableShortcuts
              ? "按 / 或 Ctrl/Cmd + K 搜索"
              : "输入关键词"}
        </span>
      </div>
      <Link className="search-open" href={searchHref} onClick={onNavigate}>
        打开搜索页
      </Link>
      {hasQuery ? (
        <SearchResults
          onNavigate={onNavigate}
          results={results}
          terms={terms}
          variant="compact"
        />
      ) : null}
    </section>
  );
}
