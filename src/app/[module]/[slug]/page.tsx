import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdjacentDocNav } from "@/components/adjacent-doc-nav";
import { DocShell } from "@/components/doc-shell";
import { MarkdownContent } from "@/components/markdown-content";
import {
  getAllDocParams,
  getDocBySlug,
  getDocPageData,
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
  const pageData = getDocPageData(module, slug);

  if (!pageData) {
    notFound();
  }

  return (
    <DocShell
      activeModule={module}
      activeSlug={slug}
      modules={pageData.modules}
      searchIndex={pageData.searchIndex}
      tableOfContents={pageData.doc.tableOfContents}
    >
      <article className="doc-article">
        <header className="doc-header">
          <p>{pageData.activeModule.title}</p>
          <h1>{pageData.doc.title}</h1>
        </header>
        <MarkdownContent content={stripFirstHeading(pageData.doc.content)} />
        <AdjacentDocNav adjacentDocs={pageData.adjacentDocs} />
      </article>
    </DocShell>
  );
}
