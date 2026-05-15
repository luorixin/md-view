import type { DocModule, SearchIndexItem } from "@/lib/docs";

import { DocNav } from "./doc-shell";
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
  return (
    <header className="mobile-header">
      <div>
        <span>源码学习文档</span>
        <strong>{activeModule.toUpperCase()}</strong>
      </div>
      <details className="mobile-menu">
        <summary>目录</summary>
        <div className="mobile-menu-panel">
          <SearchPanel modules={modules} searchIndex={searchIndex} />
          <DocNav
            activeModule={activeModule}
            activeSlug={activeSlug}
            modules={modules}
          />
        </div>
      </details>
    </header>
  );
}
