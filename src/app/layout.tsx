import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "源码学习文档",
  description: "本地 Markdown 源码学习文档站",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
