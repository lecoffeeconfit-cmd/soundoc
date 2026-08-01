import { cleanText, countWords, detectLanguage } from './text';
import type { ItemType, LibraryItem, SoundocDocument, SoundocSection, SoundocSourceType } from '../types';

export function sectionsFromText(text: string, title?: string): SoundocSection[] {
  const lines = cleanText(text).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const sections: SoundocSection[] = [];
  let current: SoundocSection | undefined;
  const heading = (line: string) => line.length <= 90 && (/^#{1,6}\s+/.test(line) || (/^[A-Z][A-Za-z0-9 ,:&'’()/-]{2,80}$/.test(line) && line.split(/\s+/).length <= 10));
  lines.forEach((line) => {
    const normalized = line.replace(/^#{1,6}\s+/, '').trim();
    if (heading(line) && (!current || current.text.length > 80)) {
      current = { id: `section-${sections.length + 1}`, title: normalized, level: /^#{1,6}/.test(line) ? line.match(/^#+/)?.[0].length : 2, text: '', order: sections.length };
      sections.push(current);
    } else if (current) current.text = current.text ? `${current.text}\n${line}` : line;
    else { current = { id: `section-${sections.length + 1}`, title: sections.length === 0 ? title : undefined, level: 1, text: line, order: sections.length }; sections.push(current); }
  });
  return sections.length ? sections : [{ id: 'section-1', title, level: 1, text: cleanText(text), order: 0 }];
}

export function sourceTypeFor(itemType: ItemType, explicit?: SoundocSourceType): SoundocSourceType {
  if (explicit) return explicit;
  return itemType === 'article' ? 'url' : 'text';
}

export function libraryItemToDocument(item: LibraryItem): SoundocDocument {
  return { id: item.id, title: item.title, author: item.author, sourceUrl: item.sourceUrl, sourceDomain: item.source, sourceType: sourceTypeFor(item.type, item.sourceType), originalText: item.originalText, cleanedText: item.cleanedText ?? item.text, speakableText: item.speakableText, sections: item.sections ?? sectionsFromText(item.text, item.title), wordCount: item.wordCount, language: item.language, extractionMethod: item.extractionMethod ?? 'legacy-library-item', extractionConfidence: item.extractionConfidence ?? 1, extractionWarnings: item.extractionWarnings ?? [], createdAt: new Date(item.createdAt).toISOString(), updatedAt: new Date(item.updatedAt).toISOString(), lastOpenedAt: item.lastOpenedAt ? new Date(item.lastOpenedAt).toISOString() : undefined, completedAt: item.completedAt ? new Date(item.completedAt).toISOString() : undefined };
}

