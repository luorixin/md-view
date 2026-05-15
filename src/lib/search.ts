import type { SearchIndexItem } from "./docs";

export type SearchOptions = {
  query: string;
  module: string;
};

export type SearchResult = SearchIndexItem & {
  matches: string[];
  score: number;
  snippet: string;
};

const SNIPPET_RADIUS = 64;

export function searchDocs(
  index: SearchIndexItem[],
  options: SearchOptions,
): SearchResult[] {
  const terms = normalizeQuery(options.query);

  if (terms.length === 0) {
    return [];
  }

  return index
    .filter((item) => options.module === "all" || item.module === options.module)
    .map((item) => scoreSearchItem(item, terms))
    .filter((result): result is SearchResult => result !== null)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-CN"));
}

export function normalizeQuery(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  );
}

export function highlightSearchText(text: string, terms: string[]): string {
  if (terms.length === 0) {
    return escapeHtml(text);
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");

  return escapeHtml(text).replace(pattern, "<mark>$1</mark>");
}

function scoreSearchItem(
  item: SearchIndexItem,
  terms: string[],
): SearchResult | null {
  const title = item.title.toLowerCase();
  const content = item.content.toLowerCase();
  const slug = item.slug.toLowerCase();
  const matchedTerms = terms.filter(
    (term) => title.includes(term) || content.includes(term) || slug.includes(term),
  );

  if (matchedTerms.length !== terms.length) {
    return null;
  }

  const score = matchedTerms.reduce((total, term) => {
    const titleHits = countOccurrences(title, term);
    const slugHits = countOccurrences(slug, term);
    const contentHits = countOccurrences(content, term);

    return total + titleHits * 12 + slugHits * 6 + contentHits;
  }, 0);

  return {
    ...item,
    matches: matchedTerms,
    score,
    snippet: createSnippet(item.content, matchedTerms),
  };
}

function createSnippet(content: string, terms: string[]): string {
  const lowerContent = content.toLowerCase();
  const firstMatch = terms
    .map((term) => lowerContent.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstMatch === undefined) {
    return content.slice(0, SNIPPET_RADIUS * 2);
  }

  const start = Math.max(0, firstMatch - SNIPPET_RADIUS);
  const end = Math.min(content.length, firstMatch + SNIPPET_RADIUS);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";

  return `${prefix}${content.slice(start, end).trim()}${suffix}`;
}

function countOccurrences(value: string, term: string): number {
  return value.split(term).length - 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
