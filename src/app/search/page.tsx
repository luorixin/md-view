import Link from "next/link";

import { getDocModules, getSearchIndex } from "@/lib/docs";
import { highlightSearchText, normalizeQuery, searchDocs } from "@/lib/search";

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
  const terms = normalizeQuery(query);
  const results = searchDocs(getSearchIndex(), { query, module });

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
          placeholder="搜索 Fiber、hydration、scheduler..."
          type="search"
        />
        <select defaultValue={module} name="module">
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
        {terms.length === 0 ? (
          <p>输入关键词开始搜索。</p>
        ) : results.length > 0 ? (
          <>
            <p>
              找到 <strong>{results.length}</strong> 个结果
            </p>
            <div>
              {results.map((result) => (
                <Link className="search-page-result" href={result.href} key={result.href}>
                  <span>{result.moduleTitle}</span>
                  <h2
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
              ))}
            </div>
          </>
        ) : (
          <p>没有找到匹配文档。</p>
        )}
      </section>
    </main>
  );
}
