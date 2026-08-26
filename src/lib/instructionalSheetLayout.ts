const COMPACT_VIEWPORT_MAX_HEIGHT = 700;
const STANDARD_VIEWPORT_MAX_HEIGHT = 880;

export function instructionalSheetTopPadding(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= COMPACT_VIEWPORT_MAX_HEIGHT) return 16;
  if (viewportHeight <= STANDARD_VIEWPORT_MAX_HEIGHT) return 32;
  return 40;
}
