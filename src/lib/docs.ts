import fs from "node:fs";
import path from "node:path";

export type DocSummary = {
  slug: string;
  title: string;
  href: string;
  module: string;
};

export type DocModule = {
  slug: string;
  title: string;
  docs: DocSummary[];
};

export type TableOfContentsItem = {
  id: string;
  level: 2 | 3;
  text: string;
};

export type DocDetail = DocSummary & {
  content: string;
  tableOfContents: TableOfContentsItem[];
};

export type SearchIndexItem = DocSummary & {
  moduleTitle: string;
  content: string;
};

export type AdjacentDocs = {
  previous: DocSummary | null;
  next: DocSummary | null;
};

export type DocPageData = {
  activeModule: DocModule;
  adjacentDocs: AdjacentDocs;
  doc: DocDetail;
  modules: DocModule[];
  searchIndex: SearchIndexItem[];
};

const DOCS_DIR = path.join(process.cwd(), "docs");

const moduleTitleMap: Record<string, string> = {
  react: "React",
  vue: "Vue",
};

type DocsStore = {
  details: Map<string, DocDetail>;
  modules: DocModule[];
  params: Array<{ module: string; slug: string }>;
  searchIndex: SearchIndexItem[];
};

let docsStore: DocsStore | null = null;

export function getDocModules(): DocModule[] {
  return getDocsStore().modules;
}

export function getAllDocParams(): Array<{ module: string; slug: string }> {
  return getDocsStore().params;
}

export function getFirstDoc(): DocSummary | null {
  return getDocModules()[0]?.docs[0] ?? null;
}

export function getDocBySlug(
  moduleSlug: string,
  docSlug: string,
): DocDetail | null {
  return getDocsStore().details.get(createDocKey(moduleSlug, docSlug)) ?? null;
}

export function getModuleBySlug(moduleSlug: string): DocModule | null {
  return getDocModules().find((module) => module.slug === moduleSlug) ?? null;
}

export function getAdjacentDocs(
  moduleSlug: string,
  docSlug: string,
): AdjacentDocs {
  const module = getModuleBySlug(moduleSlug);
  const currentIndex =
    module?.docs.findIndex((doc) => doc.slug === docSlug) ?? -1;

  if (!module || currentIndex < 0) {
    return { previous: null, next: null };
  }

  return {
    previous: module.docs[currentIndex - 1] ?? null,
    next: module.docs[currentIndex + 1] ?? null,
  };
}

export function getSearchIndex(): SearchIndexItem[] {
  return getDocsStore().searchIndex;
}

export function getDocPageData(
  moduleSlug: string,
  docSlug: string,
): DocPageData | null {
  const modules = getDocModules();
  const activeModule = getModuleBySlug(moduleSlug);
  const doc = getDocBySlug(moduleSlug, docSlug);

  if (!activeModule || !doc) {
    return null;
  }

  return {
    activeModule,
    adjacentDocs: getAdjacentDocs(moduleSlug, docSlug),
    doc,
    modules,
    searchIndex: getSearchIndex(),
  };
}

export function stripFirstHeading(content: string): string {
  return content.replace(/^# .*(?:\r?\n)+/, "").trimStart();
}

export function createHeadingSlugger() {
  const seen = new Map<string, number>();

  return (text: string) => {
    const base = slugifyHeading(text) || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);

    return count === 0 ? base : `${base}-${count}`;
  };
}

function getDocsStore(): DocsStore {
  if (process.env.NODE_ENV !== "production") {
    return buildDocsStore();
  }

  if (docsStore) {
    return docsStore;
  }

  docsStore = buildDocsStore();

  return docsStore;
}

function buildDocsStore(): DocsStore {
  if (!fs.existsSync(DOCS_DIR)) {
    return {
      details: new Map(),
      modules: [],
      params: [],
      searchIndex: [],
    };
  }

  const details = new Map<string, DocDetail>();
  const modules = fs
    .readdirSync(DOCS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => buildModule(entry.name, details))
    .filter((module) => module.docs.length > 0)
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const params = modules.flatMap((module) =>
    module.docs.map((doc) => ({
      module: module.slug,
      slug: doc.slug,
    })),
  );
  const searchIndex = modules.flatMap((module) =>
    module.docs.map((doc) => {
      const detail = details.get(createDocKey(module.slug, doc.slug));

      return {
        ...doc,
        moduleTitle: module.title,
        content: normalizeMarkdownForSearch(detail?.content ?? ""),
      };
    }),
  );

  return {
    details,
    modules,
    params,
    searchIndex,
  };
}

function buildModule(
  moduleSlug: string,
  details: Map<string, DocDetail>,
): DocModule {
  const moduleDir = path.join(DOCS_DIR, moduleSlug);
  const docs = fs
    .readdirSync(moduleDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const slug = entry.name.replace(/\.md$/, "");
      const content = fs.readFileSync(path.join(moduleDir, entry.name), "utf8");
      const detail = {
        module: moduleSlug,
        slug,
        title: extractTitle(content, slug),
        href: `/${moduleSlug}/${slug}`,
        content,
        tableOfContents: extractTableOfContents(content),
      } satisfies DocDetail;

      details.set(createDocKey(moduleSlug, slug), detail);

      return {
        module: detail.module,
        slug: detail.slug,
        title: detail.title,
        href: detail.href,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));

  return {
    slug: moduleSlug,
    title: moduleTitleMap[moduleSlug] ?? toTitleCase(moduleSlug),
    docs,
  };
}

function createDocKey(moduleSlug: string, docSlug: string): string {
  return `${moduleSlug}/${docSlug}`;
}

function extractTitle(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();

  return heading || toTitleCase(fallback.replaceAll("-", " "));
}

function extractTableOfContents(content: string): TableOfContentsItem[] {
  const slug = createHeadingSlugger();

  return content
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{2,3})\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => {
      const text = stripMarkdownInline(match[2].trim());

      return {
        id: slug(text),
        level: match[1].length as 2 | 3,
        text,
      };
    });
}

function stripMarkdownInline(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]/g, "");
}

function normalizeMarkdownForSearch(content: string): string {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/```[^\n]*\n?|\n?```/g, " "),
    )
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[>*_~|`#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyHeading(value: string): string {
  return stripMarkdownInline(value)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toTitleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
