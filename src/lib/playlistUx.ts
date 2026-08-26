export type PlaylistSelectableItem = { id: string };

export function normalizePlaylistName(value: string, maxLength = 60): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function togglePlaylistItem(itemIds: string[], itemId: string): string[] {
  return itemIds.includes(itemId) ? itemIds.filter((id) => id !== itemId) : [...itemIds, itemId];
}

export function removeItemFromPlaylists<T extends { itemIds: string[] }>(playlists: T[], itemId: string): T[] {
  return playlists.map((playlist) => ({ ...playlist, itemIds: playlist.itemIds.filter((id) => id !== itemId) }));
}

export function movePlaylistItem(itemIds: string[], index: number, direction: -1 | 1): string[] {
  const nextIndex = index + direction;
  if (index < 0 || index >= itemIds.length || nextIndex < 0 || nextIndex >= itemIds.length) return itemIds;
  const next = [...itemIds];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export function filterPlaylistItems<T extends PlaylistSelectableItem>(items: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return items;
  return items.filter((item) => `${item.id}`.toLowerCase().includes(normalizedQuery) || `${(item as T & { title?: string }).title ?? ''}`.toLowerCase().includes(normalizedQuery));
}

export function playlistSelectionSummary<T>(itemIds: string[], items: T[], durationForItem: (item: T) => number) {
  const selected = new Set(itemIds);
  return items.reduce((summary, item) => {
    if (!selected.has((item as T & { id: string }).id)) return summary;
    return { count: summary.count + 1, seconds: summary.seconds + Math.max(0, durationForItem(item)) };
  }, { count: 0, seconds: 0 });
}
