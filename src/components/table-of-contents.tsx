import type { TableOfContentsItem } from "@/lib/docs";

type TableOfContentsProps = {
  items: TableOfContentsItem[];
};

export function TableOfContents({ items }: TableOfContentsProps) {
  return (
    <aside className="toc" aria-label="页面目录">
      <h2>本页目录</h2>
      {items.length > 0 ? (
        <ol>
          {items.map((item) => (
            <li className={item.level === 3 ? "nested" : undefined} key={item.id}>
              <a href={`#${item.id}`}>{item.text}</a>
            </li>
          ))}
        </ol>
      ) : (
        <p>暂无小节</p>
      )}
    </aside>
  );
}
