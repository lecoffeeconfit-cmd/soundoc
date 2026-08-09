import * as SQLite from 'expo-sqlite';
import type { Bookmark, Folder, Highlight, LibraryItem, Playlist } from '../types';

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
      queue_position INTEGER, favorite INTEGER NOT NULL DEFAULT 0, folder_id TEXT, tags_json TEXT, source_uri TEXT, selected_mode_id TEXT
    );
    CREATE INDEX IF NOT EXISTS library_items_recent_idx ON library_items(updated_at DESC);
    CREATE TABLE IF NOT EXISTS queue_items (
      library_item_id TEXT PRIMARY KEY NOT NULL,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS queue_items_position_idx ON queue_items(position);`);
  try { db.execSync('ALTER TABLE library_items ADD COLUMN source_url TEXT;'); } catch { /* Existing installs already have the column. */ }
  for (const column of ['source_type TEXT', 'author TEXT', 'original_text TEXT', 'cleaned_text TEXT', 'speakable_text TEXT', 'sections_json TEXT', 'extraction_method TEXT', 'extraction_confidence REAL', 'extraction_warnings TEXT', 'last_opened_at INTEGER', 'completed_at INTEGER', 'current_section_id TEXT', 'current_paragraph_index INTEGER', 'current_character_offset INTEGER', 'queue_position INTEGER', 'favorite INTEGER NOT NULL DEFAULT 0', 'folder_id TEXT', 'tags_json TEXT', 'source_uri TEXT', 'selected_mode_id TEXT']) { try { db.execSync(`ALTER TABLE library_items ADD COLUMN ${column};`); } catch { /* Existing installs already have this compatibility column. */ } }
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
  `);
}

function toItem(row: Record<string, unknown>): LibraryItem {
  return {
    id: String(row.id), type: row.type as LibraryItem['type'], title: String(row.title),
    source: row.source ? String(row.source) : undefined, sourceUrl: row.source_url ? String(row.source_url) : undefined, sourceType: row.source_type ? row.source_type as LibraryItem['sourceType'] : undefined, author: row.author ? String(row.author) : undefined, originalText: row.original_text ? String(row.original_text) : undefined, cleanedText: row.cleaned_text ? String(row.cleaned_text) : undefined, speakableText: row.speakable_text ? String(row.speakable_text) : undefined, sections: row.sections_json ? safeJsonArray(row.sections_json) : undefined, extractionMethod: row.extraction_method ? String(row.extraction_method) : undefined, extractionConfidence: typeof row.extraction_confidence === 'number' ? Number(row.extraction_confidence) : undefined, extractionWarnings: row.extraction_warnings ? safeJsonStrings(row.extraction_warnings) : undefined, lastOpenedAt: row.last_opened_at ? Number(row.last_opened_at) : undefined, completedAt: row.completed_at ? Number(row.completed_at) : undefined, currentSectionId: row.current_section_id ? String(row.current_section_id) : undefined, currentParagraphIndex: row.current_paragraph_index == null ? undefined : Number(row.current_paragraph_index), currentCharacterOffset: row.current_character_offset == null ? undefined : Number(row.current_character_offset), queuePosition: row.queue_position == null ? undefined : Number(row.queue_position), favorite: Boolean(row.favorite), folderId: row.folder_id ? String(row.folder_id) : undefined, tags: row.tags_json ? safeJsonStrings(row.tags_json) : undefined, sourceUri: row.source_uri ? String(row.source_uri) : undefined, selectedModeId: row.selected_mode_id ? row.selected_mode_id as LibraryItem['selectedModeId'] : undefined, text: String(row.text), language: String(row.language),
    wordCount: Number(row.word_count), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    sentenceIndex: Number(row.sentence_index), progress: Number(row.progress),
    selectedVoice: row.selected_voice ? String(row.selected_voice) : undefined, rate: Number(row.rate),
    pitch: Number(row.pitch), completed: Boolean(row.completed),
  };
}

function safeJsonArray(value: unknown) { try { const parsed = JSON.parse(String(value)); return Array.isArray(parsed) ? parsed : undefined; } catch { return undefined; } }
function safeJsonStrings(value: unknown) { const parsed = safeJsonArray(value); return parsed?.filter((entry): entry is string => typeof entry === 'string'); }

export function listItems(): LibraryItem[] {
  return db.getAllSync<Record<string, unknown>>('SELECT * FROM library_items ORDER BY updated_at DESC').map(toItem);
}

export function saveItem(item: LibraryItem) {
  db.runSync(`INSERT OR REPLACE INTO library_items
    (id,type,title,source,source_url,source_type,author,original_text,cleaned_text,speakable_text,sections_json,extraction_method,extraction_confidence,extraction_warnings,last_opened_at,completed_at,text,language,word_count,created_at,updated_at,sentence_index,progress,selected_voice,rate,pitch,completed,current_section_id,current_paragraph_index,current_character_offset,queue_position,favorite,folder_id,tags_json,source_uri,selected_mode_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    item.id, item.type, item.title, item.source ?? null, item.sourceUrl ?? null, item.sourceType ?? null, item.author ?? null, item.originalText ?? null, item.cleanedText ?? item.text, item.speakableText ?? null, item.sections ? JSON.stringify(item.sections) : null, item.extractionMethod ?? null, item.extractionConfidence ?? null, item.extractionWarnings ? JSON.stringify(item.extractionWarnings) : null, item.lastOpenedAt ?? null, item.completedAt ?? null, item.text, item.language, item.wordCount,
    item.createdAt, item.updatedAt, item.sentenceIndex, item.progress, item.selectedVoice ?? null,
    item.rate, item.pitch, item.completed ? 1 : 0, item.currentSectionId ?? null, item.currentParagraphIndex ?? null, item.currentCharacterOffset ?? null, item.queuePosition ?? null, item.favorite ? 1 : 0, item.folderId ?? null, item.tags ? JSON.stringify(item.tags) : null, item.sourceUri ?? null, item.selectedModeId ?? null);
}

export function removeItem(id: string) {
  db.runSync('DELETE FROM queue_items WHERE library_item_id = ?', id);
  db.runSync('DELETE FROM playlist_items WHERE library_item_id = ?', id);
  db.runSync('DELETE FROM bookmarks WHERE library_item_id = ?', id);
  db.runSync('DELETE FROM highlights WHERE library_item_id = ?', id);
  db.runSync('DELETE FROM library_items WHERE id = ?', id);
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
