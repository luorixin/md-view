"use client";

import { useLayoutEffect, useRef } from "react";

const SIDEBAR_SCROLL_KEY = "md-server:sidebar-scroll-top";

type SidebarScrollAreaProps = {
  children: React.ReactNode;
};

export function SidebarScrollArea({ children }: SidebarScrollAreaProps) {
  const sidebarRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;

    if (!sidebar) {
      return;
    }

    const savedScrollTop = Number(
      window.sessionStorage.getItem(SIDEBAR_SCROLL_KEY) ?? "0",
    );

    if (Number.isFinite(savedScrollTop) && savedScrollTop > 0) {
      sidebar.scrollTop = savedScrollTop;
    }

    function saveScrollTop() {
      window.sessionStorage.setItem(
        SIDEBAR_SCROLL_KEY,
        String(sidebar?.scrollTop ?? 0),
      );
    }

    sidebar.addEventListener("scroll", saveScrollTop, { passive: true });

    return () => {
      saveScrollTop();
      sidebar.removeEventListener("scroll", saveScrollTop);
    };
  }, []);

  return (
    <aside className="sidebar" aria-label="文档导航" ref={sidebarRef}>
      {children}
    </aside>
  );
}
