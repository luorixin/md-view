"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import type { DocModule, SearchIndexItem } from "@/lib/docs";
import { SearchPanel } from "./search-panel";

type MobileNavProps = {
  activeModule: string;
  activeSlug: string;
  modules: DocModule[];
  searchIndex: SearchIndexItem[];
};

export function MobileNav({
  activeModule,
  activeSlug,
  modules,
  searchIndex,
}: MobileNavProps) {
  const pathname = usePathname();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const activeModuleTitle =
    modules.find((module) => module.slug === activeModule)?.title ??
    activeModule.toUpperCase();

  useEffect(() => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }, [pathname]);

  function closeMenu() {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }

  function handlePanelClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (target instanceof Element && target.closest("a")) {
      closeMenu();
    }
  }

  return (
    <header className="mobile-header">
      <div>
        <span>源码学习文档</span>
        <strong>{activeModuleTitle}</strong>
      </div>
      <details className="mobile-menu" ref={detailsRef}>
        <summary>目录</summary>
        <div className="mobile-menu-panel" onClickCapture={handlePanelClick}>
          <SearchPanel
            modules={modules}
            onNavigate={closeMenu}
            searchIndex={searchIndex}
          />
          <nav className="doc-nav">
            {modules.map((module) => (
              <section className="nav-module" key={module.slug}>
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
        </div>
      </details>
    </header>
  );
}
