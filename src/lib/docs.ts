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

const DOCS_DIR = path.join(process.cwd(), "docs");

const moduleTitleMap: Record<string, string> = {
  react: "React",
  vue: "Vue",
};

export function getDocModules(): DocModule[] {
  if (!fs.existsSync(DOCS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(DOCS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => buildModule(entry.name))
    .filter((module) => module.docs.length > 0)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getAllDocParams(): Array<{ module: string; slug: string }> {
  return getDocModules().flatMap((module) =>
    module.docs.map((doc) => ({
      module: module.slug,
      slug: doc.slug,
    })),
  );
}

export function getFirstDoc(): DocSummary | null {
  return getDocModules()[0]?.docs[0] ?? null;
}

export function getDocBySlug(
  moduleSlug: string,
  docSlug: string,
): DocDetail | null {
  const filePath = path.join(DOCS_DIR, moduleSlug, `${docSlug}.md`);

  if (!isPathInsideDocs(filePath) || !fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf8");

  return {
    module: moduleSlug,
    slug: docSlug,
    title: extractTitle(content, docSlug),
    href: `/${moduleSlug}/${docSlug}`,
    content,
    tableOfContents: extractTableOfContents(content),
  };
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
  return getDocModules().flatMap((module) =>
    module.docs.map((doc) => {
      const detail = getDocBySlug(module.slug, doc.slug);

      return {
        ...doc,
        moduleTitle: module.title,
        content: normalizeMarkdownForSearch(detail?.content ?? ""),
      };
    }),
  );
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

function buildModule(moduleSlug: string): DocModule {
  const moduleDir = path.join(DOCS_DIR, moduleSlug);
  const docs = fs
    .readdirSync(moduleDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const slug = entry.name.replace(/\.md$/, "");
      const content = fs.readFileSync(path.join(moduleDir, entry.name), "utf8");

      return {
        module: moduleSlug,
        slug,
        title: extractTitle(content, slug),
        href: `/${moduleSlug}/${slug}`,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));

  return {
    slug: moduleSlug,
    title: moduleTitleMap[moduleSlug] ?? toTitleCase(moduleSlug),
    docs,
  };
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

function isPathInsideDocs(filePath: string): boolean {
  const relativePath = path.relative(DOCS_DIR, filePath);

  return Boolean(relativePath) && !relativePath.startsWith("..");
}
