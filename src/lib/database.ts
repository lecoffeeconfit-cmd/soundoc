import * as SQLite from 'expo-sqlite';
import type { LibraryItem } from '../types';

const db = SQLite.openDatabaseSync('soundoc.db');

export function initializeDatabase() {
  db.execSync(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS library_items (
      id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, source TEXT,
      text TEXT NOT NULL, language TEXT NOT NULL, word_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, sentence_index INTEGER NOT NULL DEFAULT 0,
      progress REAL NOT NULL DEFAULT 0, selected_voice TEXT, rate REAL NOT NULL DEFAULT 1,
      pitch REAL NOT NULL DEFAULT 1, completed INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS library_items_recent_idx ON library_items(updated_at DESC);
    CREATE TABLE IF NOT EXISTS queue_items (
      library_item_id TEXT PRIMARY KEY NOT NULL,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS queue_items_position_idx ON queue_items(position);`);
}

function toItem(row: Record<string, unknown>): LibraryItem {
  return {
    id: String(row.id), type: row.type as LibraryItem['type'], title: String(row.title),
    source: row.source ? String(row.source) : undefined, text: String(row.text), language: String(row.language),
    wordCount: Number(row.word_count), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    sentenceIndex: Number(row.sentence_index), progress: Number(row.progress),
    selectedVoice: row.selected_voice ? String(row.selected_voice) : undefined, rate: Number(row.rate),
    pitch: Number(row.pitch), completed: Boolean(row.completed),
  };
}

export function listItems(): LibraryItem[] {
  return db.getAllSync<Record<string, unknown>>('SELECT * FROM library_items ORDER BY updated_at DESC').map(toItem);
}

export function saveItem(item: LibraryItem) {
  db.runSync(`INSERT OR REPLACE INTO library_items
    (id,type,title,source,text,language,word_count,created_at,updated_at,sentence_index,progress,selected_voice,rate,pitch,completed)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    item.id, item.type, item.title, item.source ?? null, item.text, item.language, item.wordCount,
    item.createdAt, item.updatedAt, item.sentenceIndex, item.progress, item.selectedVoice ?? null,
    item.rate, item.pitch, item.completed ? 1 : 0);
}

export function removeItem(id: string) {
  db.runSync('DELETE FROM queue_items WHERE library_item_id = ?', id);
  db.runSync('DELETE FROM library_items WHERE id = ?', id);
}

export function listQueueIds(): string[] {
  return db.getAllSync<{ library_item_id: string }>('SELECT library_item_id FROM queue_items ORDER BY position ASC').map((row) => row.library_item_id);
}

export function saveQueueIds(ids: string[]) {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM queue_items');
    ids.forEach((id, position) => db.runSync('INSERT INTO queue_items (library_item_id, position, created_at) VALUES (?, ?, ?)', id, position, Date.now()));
  });
}
