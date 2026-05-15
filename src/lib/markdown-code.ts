export function getCodeLanguage(className: string | undefined): string | null {
  const languageClass = className
    ?.split(/\s+/)
    .find((item) => item.startsWith("language-"));

  return languageClass?.replace("language-", "").toLowerCase() ?? null;
}

export function isMermaidLanguage(language: string | null): boolean {
  return language === "mermaid" || language === "mmd";
}
