import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "源码学习文档",
  description: "React 与 Vue 源码学习文档站",
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
