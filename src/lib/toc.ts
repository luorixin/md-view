export type TocVisibilityEntry = {
  id: string;
  isIntersecting: boolean;
  ratio: number;
};

export function pickActiveTocId(
  orderedIds: string[],
  entries: TocVisibilityEntry[],
  fallbackId: string,
): string {
  const visibleEntries = entries
    .filter((entry) => entry.isIntersecting)
    .sort(
      (a, b) =>
        b.ratio - a.ratio ||
        orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id),
    );

  return visibleEntries[0]?.id ?? fallbackId;
}
