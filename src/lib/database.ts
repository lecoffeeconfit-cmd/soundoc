import * as SQLite from 'expo-sqlite';
import type { Bookmark, DocumentChapter, DocumentTextChunk, Folder, Highlight, LargeDocumentInfo, LargeDocumentStatus, LibraryItem, Playlist } from '../types';

const db = SQLite.openDatabaseSync('soundoc.db');

export function initializeDatabase() {
  db.execSync(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS library_items (
      id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, source TEXT,
      text TEXT NOT NULL, source_url TEXT, source_type TEXT, author TEXT, original_text TEXT, cleaned_text TEXT, speakable_text TEXT, sections_json TEXT, extraction_method TEXT, extraction_confidence REAL, extraction_warnings TEXT, last_opened_at INTEGER, completed_at INTEGER, language TEXT NOT NULL, word_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, sentence_index INTEGER NOT NULL DEFAULT 0,
      progress REAL NOT NULL DEFAULT 0, selected_voice TEXT, rate REAL NOT NULL DEFAULT 1,
      pitch REAL NOT NULL DEFAULT 1, completed INTEGER NOT NULL DEFAULT 0,
      current_section_id TEXT, current_paragraph_index INTEGER, current_character_offset INTEGER,
      queue_position INTEGER, favorite INTEGER NOT NULL DEFAULT 0, folder_id TEXT, tags_json TEXT, source_uri TEXT, selected_mode_id TEXT, current_chunk_index INTEGER, file_size INTEGER, page_count INTEGER, estimated_duration_seconds REAL
    );
    CREATE INDEX IF NOT EXISTS library_items_recent_idx ON library_items(updated_at DESC);
    CREATE TABLE IF NOT EXISTS queue_items (
      library_item_id TEXT PRIMARY KEY NOT NULL,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS queue_items_position_idx ON queue_items(position);`);
  try { db.execSync('ALTER TABLE library_items ADD COLUMN source_url TEXT;'); } catch { /* Existing installs already have the column. */ }
  for (const column of ['source_type TEXT', 'author TEXT', 'original_text TEXT', 'cleaned_text TEXT', 'speakable_text TEXT', 'sections_json TEXT', 'extraction_method TEXT', 'extraction_confidence REAL', 'extraction_warnings TEXT', 'last_opened_at INTEGER', 'completed_at INTEGER', 'current_section_id TEXT', 'current_paragraph_index INTEGER', 'current_character_offset INTEGER', 'queue_position INTEGER', 'favorite INTEGER NOT NULL DEFAULT 0', 'folder_id TEXT', 'tags_json TEXT', 'source_uri TEXT', 'selected_mode_id TEXT', 'current_chunk_index INTEGER', 'file_size INTEGER', 'page_count INTEGER', 'estimated_duration_seconds REAL']) { try { db.execSync(`ALTER TABLE library_items ADD COLUMN ${column};`); } catch { /* Existing installs already have this compatibility column. */ } }
  db.execSync(`CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS playlist_items (
    playlist_id TEXT NOT NULL, library_item_id TEXT NOT NULL, position INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, library_item_id)
  );
  CREATE INDEX IF NOT EXISTS playlist_items_position_idx ON playlist_items(playlist_id, position);`);
  db.execSync(`CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY NOT NULL, library_item_id TEXT NOT NULL, section_id TEXT, paragraph_index INTEGER,
    sentence_index INTEGER NOT NULL, label TEXT, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS bookmarks_item_idx ON bookmarks(library_item_id, sentence_index);
  CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY NOT NULL, library_item_id TEXT NOT NULL, section_id TEXT, start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL, text TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS highlights_item_idx ON highlights(library_item_id, start_offset);
  CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS document_processing (
    document_id TEXT PRIMARY KEY NOT NULL, original_file_name TEXT, source_uri TEXT, format TEXT NOT NULL, mime_type TEXT,
    file_size INTEGER, page_count INTEGER, status TEXT NOT NULL, processed_units INTEGER NOT NULL DEFAULT 0, total_units INTEGER,
    processed_bytes INTEGER NOT NULL DEFAULT 0, total_bytes INTEGER, word_count INTEGER NOT NULL DEFAULT 0,
    estimated_duration_seconds REAL NOT NULL DEFAULT 0, error_message TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY NOT NULL, document_id TEXT NOT NULL, sequence INTEGER NOT NULL, text TEXT NOT NULL,
    word_count INTEGER NOT NULL, estimated_duration_seconds REAL NOT NULL, section_id TEXT, section_title TEXT,
    source_start INTEGER, source_end INTEGER, UNIQUE(document_id, sequence)
  );
  CREATE INDEX IF NOT EXISTS document_chunks_document_sequence_idx ON document_chunks(document_id, sequence);
  CREATE INDEX IF NOT EXISTS document_processing_status_idx ON document_processing(status, updated_at);
  `);
}

function toItem(row: Record<string, unknown>): LibraryItem {
  return {
    id: String(row.id), type: row.type as LibraryItem['type'], title: String(row.title),
    source: row.source ? String(row.source) : undefined, sourceUrl: row.source_url ? String(row.source_url) : undefined, sourceType: row.source_type ? row.source_type as LibraryItem['sourceType'] : undefined, author: row.author ? String(row.author) : undefined, originalText: row.original_text ? String(row.original_text) : undefined, cleanedText: row.cleaned_text ? String(row.cleaned_text) : undefined, speakableText: row.speakable_text ? String(row.speakable_text) : undefined, sections: row.sections_json ? safeJsonArray(row.sections_json) : undefined, extractionMethod: row.extraction_method ? String(row.extraction_method) : undefined, extractionConfidence: typeof row.extraction_confidence === 'number' ? Number(row.extraction_confidence) : undefined, extractionWarnings: row.extraction_warnings ? safeJsonStrings(row.extraction_warnings) : undefined, lastOpenedAt: row.last_opened_at ? Number(row.last_opened_at) : undefined, completedAt: row.completed_at ? Number(row.completed_at) : undefined, currentSectionId: row.current_section_id ? String(row.current_section_id) : undefined, currentParagraphIndex: row.current_paragraph_index == null ? undefined : Number(row.current_paragraph_index), currentCharacterOffset: row.current_character_offset == null ? undefined : Number(row.current_character_offset), queuePosition: row.queue_position == null ? undefined : Number(row.queue_position), favorite: Boolean(row.favorite), folderId: row.folder_id ? String(row.folder_id) : undefined, tags: row.tags_json ? safeJsonStrings(row.tags_json) : undefined, sourceUri: row.source_uri ? String(row.source_uri) : undefined, selectedModeId: row.selected_mode_id ? row.selected_mode_id as LibraryItem['selectedModeId'] : undefined, text: String(row.text), language: String(row.language),
    wordCount: Number(row.processing_word_count ?? row.word_count), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    sentenceIndex: Number(row.sentence_index), progress: Number(row.progress),
    selectedVoice: row.selected_voice ? String(row.selected_voice) : undefined, rate: Number(row.rate),
    pitch: Number(row.pitch), completed: Boolean(row.completed),
    currentChunkIndex: row.current_chunk_index == null ? undefined : Number(row.current_chunk_index),
    storageMode: row.processing_status ? 'chunked' : 'inline', processingStatus: row.processing_status as LargeDocumentStatus | undefined,
    processingProgress: row.processing_status ? processingProgress(row) : undefined, processedUnits: row.processed_units == null ? undefined : Number(row.processed_units), totalUnits: row.total_units == null ? undefined : Number(row.total_units),
    fileSize: row.processing_file_size == null ? row.file_size == null ? undefined : Number(row.file_size) : Number(row.processing_file_size), pageCount: row.processing_page_count == null ? row.page_count == null ? undefined : Number(row.page_count) : Number(row.processing_page_count), estimatedDurationSeconds: row.processing_duration == null ? row.estimated_duration_seconds == null ? undefined : Number(row.estimated_duration_seconds) : Number(row.processing_duration), processingError: row.processing_error ? String(row.processing_error) : undefined,
  };
}

function processingProgress(row: Record<string, unknown>) {
  const totalBytes = Number(row.total_bytes ?? 0); const processedBytes = Number(row.processed_bytes ?? 0);
  const totalUnits = Number(row.total_units ?? 0); const processedUnits = Number(row.processed_units ?? 0);
  if (totalBytes > 0) return Math.min(1, Math.max(0, processedBytes / totalBytes));
  if (totalUnits > 0) return Math.min(1, Math.max(0, processedUnits / totalUnits));
  return row.processing_status === 'ready' ? 1 : 0;
}

function safeJsonArray(value: unknown) { try { const parsed = JSON.parse(String(value)); return Array.isArray(parsed) ? parsed : undefined; } catch { return undefined; } }
function safeJsonStrings(value: unknown) { const parsed = safeJsonArray(value); return parsed?.filter((entry): entry is string => typeof entry === 'string'); }

export function listItems(): LibraryItem[] {
  return db.getAllSync<Record<string, unknown>>(`SELECT library_items.*, document_processing.status AS processing_status,
    document_processing.processed_units, document_processing.total_units, document_processing.processed_bytes,
    document_processing.total_bytes, document_processing.file_size AS processing_file_size, document_processing.page_count AS processing_page_count,
    document_processing.estimated_duration_seconds AS processing_duration, document_processing.word_count AS processing_word_count, document_processing.error_message AS processing_error
    FROM library_items LEFT JOIN document_processing ON document_processing.document_id = library_items.id
    ORDER BY library_items.updated_at DESC`).map(toItem);
}

export function saveItem(item: LibraryItem) {
  db.runSync(`INSERT OR REPLACE INTO library_items
    (id,type,title,source,source_url,source_type,author,original_text,cleaned_text,speakable_text,sections_json,extraction_method,extraction_confidence,extraction_warnings,last_opened_at,completed_at,text,language,word_count,created_at,updated_at,sentence_index,progress,selected_voice,rate,pitch,completed,current_section_id,current_paragraph_index,current_character_offset,queue_position,favorite,folder_id,tags_json,source_uri,selected_mode_id,current_chunk_index,file_size,page_count,estimated_duration_seconds)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    item.id, item.type, item.title, item.source ?? null, item.sourceUrl ?? null, item.sourceType ?? null, item.author ?? null, item.originalText ?? null, item.cleanedText ?? item.text, item.speakableText ?? null, item.sections ? JSON.stringify(item.sections) : null, item.extractionMethod ?? null, item.extractionConfidence ?? null, item.extractionWarnings ? JSON.stringify(item.extractionWarnings) : null, item.lastOpenedAt ?? null, item.completedAt ?? null, item.text, item.language, item.wordCount,
    item.createdAt, item.updatedAt, item.sentenceIndex, item.progress, item.selectedVoice ?? null,
    item.rate, item.pitch, item.completed ? 1 : 0, item.currentSectionId ?? null, item.currentParagraphIndex ?? null, item.currentCharacterOffset ?? null, item.queuePosition ?? null, item.favorite ? 1 : 0, item.folderId ?? null, item.tags ? JSON.stringify(item.tags) : null, item.sourceUri ?? null, item.selectedModeId ?? null, item.currentChunkIndex ?? null, item.fileSize ?? null, item.pageCount ?? null, item.estimatedDurationSeconds ?? null);
}

export function removeItem(id: string) {
  db.runSync('DELETE FROM queue_items WHERE library_item_id = ?', id);
  db.runSync('DELETE FROM playlist_items WHERE library_item_id = ?', id);
  db.runSync('DELETE FROM bookmarks WHERE library_item_id = ?', id);
  db.runSync('DELETE FROM highlights WHERE library_item_id = ?', id);
  db.runSync('DELETE FROM document_chunks WHERE document_id = ?', id);
  db.runSync('DELETE FROM document_processing WHERE document_id = ?', id);
  db.runSync('DELETE FROM library_items WHERE id = ?', id);
}

function infoFromRow(row: Record<string, unknown>): LargeDocumentInfo {
  return { documentId: String(row.document_id), originalFileName: row.original_file_name ? String(row.original_file_name) : undefined, sourceUri: row.source_uri ? String(row.source_uri) : undefined, format: String(row.format), mimeType: row.mime_type ? String(row.mime_type) : undefined, fileSize: row.file_size == null ? undefined : Number(row.file_size), pageCount: row.page_count == null ? undefined : Number(row.page_count), status: row.status as LargeDocumentStatus, processedUnits: Number(row.processed_units), totalUnits: row.total_units == null ? undefined : Number(row.total_units), processedBytes: Number(row.processed_bytes), totalBytes: row.total_bytes == null ? undefined : Number(row.total_bytes), wordCount: Number(row.word_count), estimatedDurationSeconds: Number(row.estimated_duration_seconds), errorMessage: row.error_message ? String(row.error_message) : undefined, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) };
}

export function saveLargeDocumentInfo(info: LargeDocumentInfo) {
  db.runSync(`INSERT OR REPLACE INTO document_processing (document_id,original_file_name,source_uri,format,mime_type,file_size,page_count,status,processed_units,total_units,processed_bytes,total_bytes,word_count,estimated_duration_seconds,error_message,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, info.documentId, info.originalFileName ?? null, info.sourceUri ?? null, info.format, info.mimeType ?? null, info.fileSize ?? null, info.pageCount ?? null, info.status, info.processedUnits, info.totalUnits ?? null, info.processedBytes, info.totalBytes ?? null, info.wordCount, info.estimatedDurationSeconds, info.errorMessage ?? null, info.createdAt, info.updatedAt);
}

export function getLargeDocumentInfo(documentId: string) {
  const row = db.getFirstSync<Record<string, unknown>>('SELECT * FROM document_processing WHERE document_id = ?', documentId);
  return row ? infoFromRow(row) : undefined;
}

export function listResumableLargeDocuments() {
  return db.getAllSync<Record<string, unknown>>(`SELECT * FROM document_processing WHERE status IN ('imported','queued','analyzing','processing','partiallyReady') ORDER BY created_at ASC`).map(infoFromRow);
}

export function findLikelyLargeDocumentDuplicate(originalFileName: string, fileSize?: number) {
  const row = fileSize == null
    ? db.getFirstSync<Record<string, unknown>>('SELECT * FROM document_processing WHERE original_file_name = ? ORDER BY updated_at DESC LIMIT 1', originalFileName)
    : db.getFirstSync<Record<string, unknown>>('SELECT * FROM document_processing WHERE original_file_name = ? AND file_size = ? ORDER BY updated_at DESC LIMIT 1', originalFileName, fileSize);
  return row ? infoFromRow(row) : undefined;
}

export function appendDocumentChunks(documentId: string, chunks: DocumentTextChunk[]) {
  if (!chunks.length) return;
  db.withTransactionSync(() => chunks.forEach((chunk) => db.runSync(`INSERT OR REPLACE INTO document_chunks (id,document_id,sequence,text,word_count,estimated_duration_seconds,section_id,section_title,source_start,source_end)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, chunk.id, documentId, chunk.sequence, chunk.text, chunk.wordCount, chunk.estimatedDurationSeconds, chunk.sectionId ?? null, chunk.sectionTitle ?? null, chunk.sourceStart ?? null, chunk.sourceEnd ?? null)));
}

function chunkFromRow(row: Record<string, unknown>): DocumentTextChunk {
  return { id: String(row.id), documentId: String(row.document_id), sequence: Number(row.sequence), text: String(row.text), wordCount: Number(row.word_count), estimatedDurationSeconds: Number(row.estimated_duration_seconds), sectionId: row.section_id ? String(row.section_id) : undefined, sectionTitle: row.section_title ? String(row.section_title) : undefined, sourceStart: row.source_start == null ? undefined : Number(row.source_start), sourceEnd: row.source_end == null ? undefined : Number(row.source_end) };
}

export function getDocumentChunk(documentId: string, sequence: number) {
  const row = db.getFirstSync<Record<string, unknown>>('SELECT * FROM document_chunks WHERE document_id = ? AND sequence = ?', documentId, sequence);
  return row ? chunkFromRow(row) : undefined;
}

export function getDocumentChunkWindow(documentId: string, fromSequence: number, limit = 4) {
  return db.getAllSync<Record<string, unknown>>('SELECT * FROM document_chunks WHERE document_id = ? AND sequence >= ? ORDER BY sequence ASC LIMIT ?', documentId, Math.max(0, fromSequence), Math.max(1, Math.min(5, limit))).map(chunkFromRow);
}

export function getDocumentChunkCount(documentId: string) {
  return Number(db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM document_chunks WHERE document_id = ?', documentId)?.count ?? 0);
}

export function listDocumentChapters(documentId: string): DocumentChapter[] {
  return db.getAllSync<{ document_id: string; section_id: string; section_title: string; sequence: number }>(`SELECT document_id, section_id, section_title, MIN(sequence) AS sequence
    FROM document_chunks WHERE document_id = ? AND section_id IS NOT NULL AND section_title IS NOT NULL
    GROUP BY document_id, section_id, section_title ORDER BY sequence ASC`, documentId)
    .map((row) => ({ documentId: row.document_id, id: row.section_id, title: row.section_title, sequence: Number(row.sequence) }));
}

export function listPlaylists(): Playlist[] {
  const playlists = db.getAllSync<Record<string, unknown>>('SELECT * FROM playlists ORDER BY updated_at DESC').map((row) => ({
    id: String(row.id), name: String(row.name), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), itemIds: [] as string[],
  }));
  const memberships = db.getAllSync<{ playlist_id: string; library_item_id: string }>('SELECT playlist_id, library_item_id FROM playlist_items ORDER BY position ASC');
  memberships.forEach((membership) => playlists.find((playlist) => playlist.id === membership.playlist_id)?.itemIds.push(membership.library_item_id));
  return playlists;
}

export function createPlaylist(name: string): Playlist {
  const now = Date.now();
  const playlist: Playlist = { id: `playlist-${now}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), createdAt: now, updatedAt: now, itemIds: [] };
  db.runSync('INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', playlist.id, playlist.name, now, now);
  return playlist;
}

export function renamePlaylist(id: string, name: string) {
  db.runSync('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?', name.trim(), Date.now(), id);
}

export function deletePlaylist(id: string) {
  db.runSync('DELETE FROM playlist_items WHERE playlist_id = ?', id);
  db.runSync('DELETE FROM playlists WHERE id = ?', id);
}

export function setPlaylistItemIds(playlistId: string, itemIds: string[]) {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM playlist_items WHERE playlist_id = ?', playlistId);
    itemIds.forEach((itemId, position) => db.runSync('INSERT INTO playlist_items (playlist_id, library_item_id, position) VALUES (?, ?, ?)', playlistId, itemId, position));
    db.runSync('UPDATE playlists SET updated_at = ? WHERE id = ?', Date.now(), playlistId);
  });
}

export function listQueueIds(): string[] {
  return db.getAllSync<{ library_item_id: string }>('SELECT library_item_id FROM queue_items ORDER BY position ASC').map((row) => row.library_item_id);
}

export function saveQueueIds(ids: string[]) {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM queue_items');
    db.runSync('UPDATE library_items SET queue_position = NULL');
    ids.forEach((id, position) => db.runSync('INSERT INTO queue_items (library_item_id, position, created_at) VALUES (?, ?, ?)', id, position, Date.now()));
    ids.forEach((id, position) => db.runSync('UPDATE library_items SET queue_position = ? WHERE id = ?', position, id));
  });
}

const bookmarkFromRow = (row: Record<string, unknown>): Bookmark => ({ id: String(row.id), libraryItemId: String(row.library_item_id), sectionId: row.section_id ? String(row.section_id) : undefined, paragraphIndex: row.paragraph_index == null ? undefined : Number(row.paragraph_index), sentenceIndex: Number(row.sentence_index), label: row.label ? String(row.label) : undefined, note: row.note ? String(row.note) : undefined, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) });
export function listBookmarks(libraryItemId?: string): Bookmark[] { const rows = libraryItemId ? db.getAllSync<Record<string, unknown>>('SELECT * FROM bookmarks WHERE library_item_id = ? ORDER BY sentence_index ASC', libraryItemId) : db.getAllSync<Record<string, unknown>>('SELECT * FROM bookmarks ORDER BY updated_at DESC'); return rows.map(bookmarkFromRow); }
export function saveBookmark(bookmark: Bookmark) { db.runSync('INSERT OR REPLACE INTO bookmarks (id,library_item_id,section_id,paragraph_index,sentence_index,label,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', bookmark.id, bookmark.libraryItemId, bookmark.sectionId ?? null, bookmark.paragraphIndex ?? null, bookmark.sentenceIndex, bookmark.label ?? null, bookmark.note ?? null, bookmark.createdAt, bookmark.updatedAt); }
export function deleteBookmark(id: string) { db.runSync('DELETE FROM bookmarks WHERE id = ?', id); }

const highlightFromRow = (row: Record<string, unknown>): Highlight => ({ id: String(row.id), libraryItemId: String(row.library_item_id), sectionId: row.section_id ? String(row.section_id) : undefined, startOffset: Number(row.start_offset), endOffset: Number(row.end_offset), text: String(row.text), note: row.note ? String(row.note) : undefined, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) });
export function listHighlights(libraryItemId?: string): Highlight[] { const rows = libraryItemId ? db.getAllSync<Record<string, unknown>>('SELECT * FROM highlights WHERE library_item_id = ? ORDER BY start_offset ASC', libraryItemId) : db.getAllSync<Record<string, unknown>>('SELECT * FROM highlights ORDER BY updated_at DESC'); return rows.map(highlightFromRow); }
export function saveHighlight(highlight: Highlight) { db.runSync('INSERT OR REPLACE INTO highlights (id,library_item_id,section_id,start_offset,end_offset,text,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', highlight.id, highlight.libraryItemId, highlight.sectionId ?? null, highlight.startOffset, highlight.endOffset, highlight.text, highlight.note ?? null, highlight.createdAt, highlight.updatedAt); }
export function deleteHighlight(id: string) { db.runSync('DELETE FROM highlights WHERE id = ?', id); }

export function listFolders(): Folder[] { return db.getAllSync<Record<string, unknown>>('SELECT * FROM folders ORDER BY name COLLATE NOCASE').map((row) => ({ id: String(row.id), name: String(row.name), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) })); }
export function createFolder(name: string): Folder { const now = Date.now(); const folder = { id: `folder-${now}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), createdAt: now, updatedAt: now }; db.runSync('INSERT INTO folders (id,name,created_at,updated_at) VALUES (?,?,?,?)', folder.id, folder.name, now, now); return folder; }
export function deleteFolder(id: string) { db.runSync('UPDATE library_items SET folder_id = NULL WHERE folder_id = ?', id); db.runSync('DELETE FROM folders WHERE id = ?', id); }
