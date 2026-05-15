import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdjacentDocNav } from "@/components/adjacent-doc-nav";
import { DocShell } from "@/components/doc-shell";
import { MarkdownContent } from "@/components/markdown-content";
import {
  getAdjacentDocs,
  getAllDocParams,
  getDocBySlug,
  getDocModules,
  getModuleBySlug,
  getSearchIndex,
  stripFirstHeading,
} from "@/lib/docs";

type DocPageProps = {
  params: Promise<{
    module: string;
    slug: string;
  }>;
};

export function generateStaticParams() {
  return getAllDocParams();
}

export async function generateMetadata({
  params,
}: DocPageProps): Promise<Metadata> {
  const { module, slug } = await params;
  const doc = getDocBySlug(module, slug);

  if (!doc) {
    return {};
  }

  return {
    title: `${doc.title} | 源码学习文档`,
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const { module, slug } = await params;
  const doc = getDocBySlug(module, slug);
  const activeModule = getModuleBySlug(module);

  if (!doc || !activeModule) {
    notFound();
  }

  return (
    <DocShell
      activeModule={module}
      activeSlug={slug}
      modules={getDocModules()}
      searchIndex={getSearchIndex()}
      tableOfContents={doc.tableOfContents}
    >
      <article className="doc-article">
        <header className="doc-header">
          <p>{activeModule.title}</p>
          <h1>{doc.title}</h1>
        </header>
        <MarkdownContent content={stripFirstHeading(doc.content)} />
        <AdjacentDocNav adjacentDocs={getAdjacentDocs(module, slug)} />
      </article>
    </DocShell>
  );
}
