import Link from "next/link";

import type { DocModule, TableOfContentsItem } from "@/lib/docs";
import type { SearchIndexItem } from "@/lib/docs";

import { MobileNav } from "./mobile-nav";
import { SearchPanel } from "./search-panel";
import { SidebarScrollArea } from "./sidebar-scroll-area";
import { TableOfContents } from "./table-of-contents";

type DocShellProps = {
  activeModule: string;
  activeSlug: string;
  children: React.ReactNode;
  modules: DocModule[];
  searchIndex: SearchIndexItem[];
  tableOfContents: TableOfContentsItem[];
};

export function DocShell({
  activeModule,
  activeSlug,
  children,
  modules,
  searchIndex,
  tableOfContents,
}: DocShellProps) {
  return (
    <div className="site-shell">
      <MobileNav
        activeModule={activeModule}
        activeSlug={activeSlug}
        modules={modules}
        searchIndex={searchIndex}
      />
      <SidebarScrollArea>
        <div className="brand">
          <span>Source Notes</span>
          <strong>源码学习文档</strong>
        </div>
        <SearchPanel modules={modules} searchIndex={searchIndex} />
        <DocNav
          activeModule={activeModule}
          activeSlug={activeSlug}
          modules={modules}
        />
      </SidebarScrollArea>
      <main className="content">{children}</main>
      <TableOfContents items={tableOfContents} />
    </div>
  );
}

export function DocNav({
  activeModule,
  activeSlug,
  modules,
}: {
  activeModule: string;
  activeSlug: string;
  modules: DocModule[];
}) {
  return (
    <nav className="doc-nav">
      {modules.map((module) => (
        <section key={module.slug} className="nav-module">
          <h2>{module.title}</h2>
          <ul>
            {module.docs.map((doc) => {
              const isActive =
                module.slug === activeModule && doc.slug === activeSlug;

              return (
                <li key={doc.href}>
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={isActive ? "active" : undefined}
                    href={doc.href}
                  >
                    {doc.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
