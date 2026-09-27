import type { Bookmark, DocumentChapter, DocumentTextChunk, Folder, Highlight, LargeDocumentInfo, LibraryItem, Playlist, SoundocSection } from '../types';
import { sectionKindForId, summarizeSectionText } from './sectionIntelligence';

type WebDatabaseState = {
  items: LibraryItem[];
  largeDocuments: LargeDocumentInfo[];
  chunks: DocumentTextChunk[];
  playlists: Playlist[];
  queueIds: string[];
  bookmarks: Bookmark[];
  highlights: Highlight[];
  folders: Folder[];
};

const STORAGE_KEY = 'soundoc.web.database.v1';

const emptyState = (): WebDatabaseState => ({
  items: [],
  largeDocuments: [],
  chunks: [],
  playlists: [],
  queueIds: [],
  bookmarks: [],
  highlights: [],
  folders: [],
});

function storage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function normalizeState(value: unknown): WebDatabaseState {
  const candidate = value && typeof value === 'object' ? value as Partial<WebDatabaseState> : {};
  return {
    items: Array.isArray(candidate.items) ? candidate.items : [],
    largeDocuments: Array.isArray(candidate.largeDocuments) ? candidate.largeDocuments : [],
    chunks: Array.isArray(candidate.chunks) ? candidate.chunks : [],
    playlists: Array.isArray(candidate.playlists) ? candidate.playlists : [],
    queueIds: Array.isArray(candidate.queueIds) ? candidate.queueIds.filter((id): id is string => typeof id === 'string') : [],
    bookmarks: Array.isArray(candidate.bookmarks) ? candidate.bookmarks : [],
    highlights: Array.isArray(candidate.highlights) ? candidate.highlights : [],
    folders: Array.isArray(candidate.folders) ? candidate.folders : [],
  };
}

function loadState() {
  const saved = storage()?.getItem(STORAGE_KEY);
  if (!saved) return emptyState();
  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    return emptyState();
  }
}

let state = loadState();

function persist() {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the in-memory fallback usable when browser storage is unavailable or full.
  }
}

function largeDocumentFor(documentId: string) {
  return state.largeDocuments.find((info) => info.documentId === documentId);
}

function processingProgress(info: LargeDocumentInfo) {
  if ((info.totalBytes ?? 0) > 0) return Math.min(1, Math.max(0, info.processedBytes / (info.totalBytes ?? 1)));
  if ((info.totalUnits ?? 0) > 0) return Math.min(1, Math.max(0, info.processedUnits / (info.totalUnits ?? 1)));
  return info.status === 'ready' ? 1 : 0;
}

function itemForStorage(item: LibraryItem) {
  const { storageMode: _storageMode, processingStatus: _processingStatus, processingProgress: _processingProgress, processedUnits: _processedUnits, totalUnits: _totalUnits, processingError: _processingError, ...stored } = item;
  return stored;
}

function itemFromStorage(item: LibraryItem): LibraryItem {
  const info = largeDocumentFor(item.id);
  if (!info) return { ...item, storageMode: 'inline', processingStatus: undefined, processingProgress: undefined, processedUnits: undefined, totalUnits: undefined, fileSize: item.fileSize, pageCount: item.pageCount, estimatedDurationSeconds: item.estimatedDurationSeconds, processingError: undefined };
  return {
    ...item,
    storageMode: 'chunked',
    processingStatus: info.status,
    processingProgress: processingProgress(info),
    processedUnits: info.processedUnits,
    totalUnits: info.totalUnits,
    fileSize: info.fileSize ?? item.fileSize,
    pageCount: info.pageCount ?? item.pageCount,
    estimatedDurationSeconds: info.estimatedDurationSeconds || item.estimatedDurationSeconds,
    processingError: info.errorMessage,
  };
}

export function initializeDatabase() {
  state = loadState();
}

export function listItems(): LibraryItem[] {
  return state.items
    .map(itemFromStorage)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function saveItem(item: LibraryItem) {
  state.items = [...state.items.filter((entry) => entry.id !== item.id), itemForStorage(item)];
  persist();
}

export function removeItem(id: string) {
  state.items = state.items.filter((item) => item.id !== id);
  state.queueIds = state.queueIds.filter((itemId) => itemId !== id);
  state.playlists = state.playlists.map((playlist) => ({ ...playlist, itemIds: playlist.itemIds.filter((itemId) => itemId !== id) }));
  state.bookmarks = state.bookmarks.filter((bookmark) => bookmark.libraryItemId !== id);
  state.highlights = state.highlights.filter((highlight) => highlight.libraryItemId !== id);
  state.largeDocuments = state.largeDocuments.filter((info) => info.documentId !== id);
  state.chunks = state.chunks.filter((chunk) => chunk.documentId !== id);
  persist();
}

export function saveLargeDocumentInfo(info: LargeDocumentInfo) {
  state.largeDocuments = [...state.largeDocuments.filter((entry) => entry.documentId !== info.documentId), info];
  persist();
}

export function getLargeDocumentInfo(documentId: string) {
  return largeDocumentFor(documentId);
}

export function listResumableLargeDocuments() {
  return state.largeDocuments
    .filter((info) => ['imported', 'queued', 'analyzing', 'processing', 'partiallyReady'].includes(info.status))
    .sort((left, right) => left.createdAt - right.createdAt);
}

export function findLikelyLargeDocumentDuplicate(originalFileName: string, fileSize?: number) {
  return state.largeDocuments
    .filter((info) => info.originalFileName === originalFileName && (fileSize == null || info.fileSize === fileSize))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

export function appendDocumentChunks(documentId: string, chunks: DocumentTextChunk[]) {
  if (!chunks.length) return;
  const incoming = new Map(chunks.map((chunk) => [`${chunk.documentId}:${chunk.sequence}`, chunk]));
  state.chunks = [
    ...state.chunks.filter((chunk) => chunk.documentId !== documentId || !incoming.has(`${chunk.documentId}:${chunk.sequence}`)),
    ...chunks,
  ];
  // Preserve the native primary-key replacement behavior when a caller reuses a chunk ID.
  const byId = new Map(state.chunks.map((chunk) => [chunk.id, chunk]));
  incoming.forEach((chunk) => byId.set(chunk.id, chunk));
  state.chunks = Array.from(byId.values());
  persist();
}

function chunksFor(documentId: string) {
  return state.chunks.filter((chunk) => chunk.documentId === documentId).sort((left, right) => left.sequence - right.sequence);
}

export function getDocumentChunk(documentId: string, sequence: number) {
  return chunksFor(documentId).find((chunk) => chunk.sequence === sequence);
}

export function getDocumentChunkWindow(documentId: string, fromSequence: number, limit = 4) {
  return chunksFor(documentId).filter((chunk) => chunk.sequence >= Math.max(0, fromSequence)).slice(0, Math.max(1, Math.min(5, limit)));
}

export function getDocumentChunkCount(documentId: string) {
  return chunksFor(documentId).length;
}

export function getDocumentText(documentId: string) {
  return chunksFor(documentId).map((chunk) => chunk.text).filter(Boolean).join('\n\n');
}

export function getDocumentSections(documentId: string): SoundocSection[] {
  const sections = new Map<string, { id: string; title?: string; order: number; text: string[] }>();
  chunksFor(documentId).forEach((chunk) => {
    const id = chunk.sectionId || 'document';
    const existing = sections.get(id);
    if (existing) {
      existing.text.push(chunk.text);
      return;
    }
    sections.set(id, { id, title: chunk.sectionTitle || undefined, order: chunk.sequence, text: chunk.text ? [chunk.text] : [] });
  });
  return Array.from(sections.values()).map((section) => ({ id: section.id, title: section.title, text: section.text.filter(Boolean).join('\n\n'), order: section.order, kind: sectionKindForId(section.id) }));
}

export function listDocumentChapters(documentId: string): DocumentChapter[] {
  const grouped = new Map<string, { id: string; title: string; sequence: number; firstText: string }>();
  chunksFor(documentId).forEach((chunk) => {
    if (!chunk.sectionId || !chunk.sectionTitle) return;
    const key = `${chunk.sectionId}\u0000${chunk.sectionTitle}`;
    if (!grouped.has(key)) grouped.set(key, { id: chunk.sectionId, title: chunk.sectionTitle, sequence: chunk.sequence, firstText: chunk.text });
  });
  return Array.from(grouped.values()).sort((left, right) => left.sequence - right.sequence).map((chapter) => ({
    documentId,
    id: chapter.id,
    title: chapter.title,
    sequence: chapter.sequence,
    kind: sectionKindForId(chapter.id),
    summary: summarizeSectionText(chapter.firstText, chapter.title),
  }));
}

export function listPlaylists(): Playlist[] {
  return state.playlists
    .map((playlist) => ({ ...playlist, itemIds: [...playlist.itemIds] }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function createPlaylist(name: string): Playlist {
  const now = Date.now();
  const playlist: Playlist = { id: `playlist-${now}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), createdAt: now, updatedAt: now, itemIds: [] };
  state.playlists.push(playlist);
  persist();
  return playlist;
}

export function renamePlaylist(id: string, name: string) {
  state.playlists = state.playlists.map((playlist) => playlist.id === id ? { ...playlist, name: name.trim(), updatedAt: Date.now() } : playlist);
  persist();
}

export function deletePlaylist(id: string) {
  state.playlists = state.playlists.filter((playlist) => playlist.id !== id);
  persist();
}

export function setPlaylistItemIds(playlistId: string, itemIds: string[]) {
  state.playlists = state.playlists.map((playlist) => playlist.id === playlistId ? { ...playlist, itemIds: [...itemIds], updatedAt: Date.now() } : playlist);
  persist();
}

export function listQueueIds() {
  return [...state.queueIds];
}

export function saveQueueIds(ids: string[]) {
  state.queueIds = [...ids];
  state.items = state.items.map((item) => ({ ...item, queuePosition: ids.indexOf(item.id) >= 0 ? ids.indexOf(item.id) : undefined }));
  persist();
}

export function listBookmarks(libraryItemId?: string) {
  return state.bookmarks
    .filter((bookmark) => !libraryItemId || bookmark.libraryItemId === libraryItemId)
    .sort((left, right) => libraryItemId ? left.sentenceIndex - right.sentenceIndex : right.updatedAt - left.updatedAt);
}

export function saveBookmark(bookmark: Bookmark) {
  state.bookmarks = [...state.bookmarks.filter((entry) => entry.id !== bookmark.id), bookmark];
  persist();
}

export function deleteBookmark(id: string) {
  state.bookmarks = state.bookmarks.filter((bookmark) => bookmark.id !== id);
  persist();
}

export function listHighlights(libraryItemId?: string) {
  return state.highlights
    .filter((highlight) => !libraryItemId || highlight.libraryItemId === libraryItemId)
    .sort((left, right) => libraryItemId ? left.startOffset - right.startOffset : right.updatedAt - left.updatedAt);
}

export function saveHighlight(highlight: Highlight) {
  state.highlights = [...state.highlights.filter((entry) => entry.id !== highlight.id), highlight];
  persist();
}

export function deleteHighlight(id: string) {
  state.highlights = state.highlights.filter((highlight) => highlight.id !== id);
  persist();
}

export function listFolders() {
  return [...state.folders].sort((left, right) => left.name.localeCompare(right.name));
}

export function createFolder(name: string): Folder {
  const now = Date.now();
  const folder: Folder = { id: `folder-${now}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), createdAt: now, updatedAt: now };
  state.folders.push(folder);
  persist();
  return folder;
}

export function deleteFolder(id: string) {
  state.items = state.items.map((item) => item.folderId === id ? { ...item, folderId: undefined } : item);
  state.folders = state.folders.filter((folder) => folder.id !== id);
  persist();
}
