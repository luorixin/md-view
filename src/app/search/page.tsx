import Link from "next/link";

import { getDocModules, getSearchIndex } from "@/lib/docs";
import { SearchResults } from "@/components/search-results";
import { getSearchPageHref, normalizeQuery, searchDocs } from "@/lib/search";

type SearchPageProps = {
  searchParams: Promise<{
    module?: string;
    q?: string;
  }>;
};

export const metadata = {
  title: "全文搜索 | 源码学习文档",
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.q ?? "";
  const module = params.module ?? "all";
  const modules = getDocModules();
  const moduleExists =
    module === "all" || modules.some((item) => item.slug === module);
  const activeModule = moduleExists ? module : "all";
  const terms = normalizeQuery(query);
  const results = searchDocs(getSearchIndex(), { query, module: activeModule });
  const canonicalHref = getSearchPageHref({ query, module: activeModule });

  return (
    <main className="search-page">
      <header>
        <Link href="/">源码学习文档</Link>
        <h1>全文搜索</h1>
      </header>
      <form className="search-page-form">
        <input
          autoFocus
          defaultValue={query}
          name="q"
          placeholder="搜索源码、组件、scheduler..."
          type="search"
        />
        <select defaultValue={activeModule} name="module">
          <option value="all">全部模块</option>
          {modules.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.title}
            </option>
          ))}
        </select>
        <button type="submit">搜索</button>
      </form>
      <section className="search-page-results" aria-label="搜索结果">
        {canonicalHref !== "/search" ? (
          <p>
            当前搜索链接：
            <Link href={canonicalHref}>{canonicalHref}</Link>
          </p>
        ) : null}
        {terms.length === 0 ? (
          <p>输入关键词开始搜索。</p>
        ) : results.length > 0 ? (
          <>
            <p>
              找到 <strong>{results.length}</strong> 个结果
            </p>
            <SearchResults results={results} terms={terms} variant="page" />
          </>
        ) : (
          <p>没有找到匹配文档。</p>
        )}
      </section>
    </main>
  );
}
