import { redirect } from "next/navigation";

import { getFirstDoc } from "@/lib/docs";

export default function HomePage() {
  const firstDoc = getFirstDoc();

  if (firstDoc) {
    redirect(firstDoc.href);
  }

  return (
    <main className="empty-state">
      <h1>暂无文档</h1>
      <p>请在 docs 目录下添加 Markdown 文件。</p>
    </main>
  );
}
